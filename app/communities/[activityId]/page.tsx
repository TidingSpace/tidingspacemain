'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase-browser';
import ErrorState from '@/components/ErrorState';
import LoadingState from '@/components/LoadingState';
import ChatScreen, { type PinnedMessage } from '@/components/ChatScreen';
import TypingBubble from '@/components/TypingBubble';
import { useImageUpload } from '@/hooks/useImageUpload';

type Message = {
  id: string;
  activity_id: string;
  author_id: string;
  text: string;
  image_url: string | null;
  created_at: string;
  author: { id: string; name: string; avatar_color: string; avatar_url?: string | null } | null;
  reactions?: { emoji: string; count: number; reactedByMe: boolean }[];
};

export default function CommunityThreadPage({ params }: { params: { activityId: string } }) {
  const supabase = createClient();
  const [meId, setMeId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [activityTitle, setActivityTitle] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  // Kept in sync via the effect below — the realtime subscription is set
  // up once (its own effect only depends on params.activityId/supabase,
  // not messages, to avoid re-subscribing on every new message), so its
  // callbacks need a ref to read the CURRENT messages list rather than
  // whatever it was at the moment the subscription was first created.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage>(null);
  const [text, setText] = useState('');
  // Map of userId -> name, not just a boolean — activity chats can have
  // multiple people typing at once, same reasoning as group chat.
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Fetched once from profiles (not auth user_metadata, which can go stale
  // if someone changes their display name later — that updates the
  // profiles table, not their auth metadata) — used only for the typing
  // broadcast payload, so others see the current, correct name.
  const myNameRef = useRef<string>('Someone');
  const typingClearTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSentAt = useRef(0);

  // Throttled — sent at most once every 2 seconds while actively typing,
  // not on every keystroke. Same pattern as the DM and group chat pages.
  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAt.current < 2000) return;
    lastTypingSentAt.current = now;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: meId, name: myNameRef.current } });
  }
  const [stagedImage, setStagedImage] = useState<{ previewUrl: string; uploadedUrl: string | null; uploading: boolean; progress: number; error: string | null } | null>(null);
  const chatImageUpload = useImageUpload('chat-images');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function loadMessages() {
    const messagesJson = await fetch(`/api/activities/${params.activityId}/messages`).then((r) => r.json());
    setMessages(messagesJson.messages || []);
    setPinnedMessage(messagesJson.pinnedMessage ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      setLoading(true);
      setError(false);
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) { window.location.href = '/login'; return; }
        if (cancelled) return; // effect was already cleaned up (e.g. React Strict Mode's double-invoke) — bail out
        setMeId(data.user.id);
        const { data: myProfile } = await supabase.from('profiles').select('name').eq('id', data.user.id).single();
        if (myProfile?.name) myNameRef.current = myProfile.name;

        const activityRes = await fetch(`/api/activities/${params.activityId}`).then((r) => r.json());
        if (cancelled) return;

        setActivityTitle(activityRes.activity?.title ?? 'Community');
        setIsOrganizer(activityRes.activity?.organizer_id === data.user.id);

        await loadMessages();
        if (cancelled) return;
        setLoading(false);

        // Live updates — every group member gets new messages pushed instantly
        channel = supabase
          .channel(`community-${params.activityId}`, { config: { broadcast: { self: false }, private: false } })
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'activity_messages', filter: `activity_id=eq.${params.activityId}` },
            (payload) => {
              const m = payload.new as Message;
              setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, { ...m, reactions: [] }]));
              // A real message arriving means they're done typing — don't
              // wait for the separate broadcast, which may lag slightly.
              setTypingUsers((prev) => {
                if (!(m.author_id in prev)) return prev;
                const next = { ...prev };
                delete next[m.author_id];
                return next;
              });
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'activity_message_reactions' },
            (payload) => {
              // Reactions are aggregated server-side, so re-fetching is the
              // simplest correct way to reflect a change — but this table
              // has no activity_id column to filter on server-side (it
              // only has message_id, one join away), so this subscription
              // necessarily receives every reaction event platform-wide,
              // not just ones on this activity's messages. This guard is
              // what stops that from meaning a full refetch on every
              // completely unrelated activity's reaction too.
              const messageId = (payload.new as any)?.message_id ?? (payload.old as any)?.message_id;
              const belongsHere = messagesRef.current.some((m) => m.id === messageId);
              if (belongsHere) loadMessages();
            }
          )
          // Broadcast, not postgres_changes — typing status is deliberately
          // never persisted to the database. Same pattern as the DM and
          // group chat pages: ephemeral, low-latency signaling, not a table
          // write for every keystroke.
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (!payload?.userId || payload.userId === data.user.id) return; // ignore my own broadcast
            setTypingUsers((prev) => ({ ...prev, [payload.userId]: payload.name }));
            if (typingClearTimeouts.current[payload.userId]) clearTimeout(typingClearTimeouts.current[payload.userId]);
            typingClearTimeouts.current[payload.userId] = setTimeout(() => {
              setTypingUsers((prev) => {
                const next = { ...prev };
                delete next[payload.userId];
                return next;
              });
            }, 3000);
          })
          .subscribe();

        channelRef.current = channel;
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      channelRef.current = null;
      Object.values(typingClearTimeouts.current).forEach(clearTimeout);
    };
  }, [params.activityId, supabase]);

  async function handleAttachImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !meId) return;

    const previewUrl = URL.createObjectURL(file);
    setStagedImage({ previewUrl, uploadedUrl: null, uploading: true, progress: 0, error: null });

    const path = `${meId}/${Date.now()}.jpg`;
    const url = await chatImageUpload.upload(file, path, 1200);
    setStagedImage((prev) => prev ? {
      ...prev,
      uploading: false,
      uploadedUrl: url,
      progress: url ? 1 : prev.progress,
      error: url ? null : (chatImageUpload.error || 'Upload failed.')
    } : prev);
  }

  function removeStagedImage() {
    if (stagedImage?.uploadedUrl) chatImageUpload.remove(stagedImage.uploadedUrl);
    if (stagedImage) URL.revokeObjectURL(stagedImage.previewUrl);
    setStagedImage(null);
  }

  async function handleSend() {
    if (!text.trim() && !stagedImage?.uploadedUrl) return;
    setSending(true);
    const res = await fetch(`/api/activities/${params.activityId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), image_url: stagedImage?.uploadedUrl ?? null })
    });
    const json = await res.json();
    setSending(false);
    if (json.message) {
      setText('');
      setStagedImage(null);
      setMessages((prev) => [...prev, json.message]);
    } else if (json.error) {
      alert(json.error);
    }
  }

  async function handleReact(messageId: string, emoji: string) {
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = m.reactions ?? [];
      const existing = reactions.find((r) => r.emoji === emoji);
      if (existing?.reactedByMe) {
        const updated = reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count - 1, reactedByMe: false } : r).filter((r) => r.count > 0);
        return { ...m, reactions: updated };
      }
      if (existing) {
        return { ...m, reactions: reactions.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r) };
      }
      return { ...m, reactions: [...reactions, { emoji, count: 1, reactedByMe: true }] };
    }));
    await fetch(`/api/activities/${params.activityId}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji })
    });
  }

  async function handlePinMessage(messageId: string) {
    const res = await fetch(`/api/activities/${params.activityId}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    await loadMessages();
  }

  async function handleUnpinMessage() {
    await fetch(`/api/activities/${params.activityId}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: null })
    });
    setPinnedMessage(null);
  }

  if (error) {
    return <ErrorState message="Couldn't load this group chat." onRetry={() => window.location.reload()} />;
  }
  if (loading) {
    return <LoadingState />;
  }

  return (
    <ChatScreen
      headerAvatarColor="#7A5AF8"
      headerTitle={activityTitle}
      headerSubtitle="Group chat for attendees"
      typingIndicator={Object.keys(typingUsers).length > 0 ? <TypingBubble label={Object.values(typingUsers).join(', ')} /> : null}
      backHref="/inbox"
      messages={messages}
      meId={meId}
      emptyMessage="No messages yet — say hello to the group."
      text={text}
      onTextChange={(v) => { setText(v); notifyTyping(); }}
      onSend={handleSend}
      sending={sending}
      stagedImage={stagedImage}
      onFileSelected={handleAttachImage}
      onRemoveStagedImage={removeStagedImage}
      placeholder="Message the group…"
      lightboxUrl={lightboxUrl}
      onSetLightboxUrl={setLightboxUrl}
      pinnedMessage={pinnedMessage}
      onUnpinMessage={handleUnpinMessage}
      canManagePins={isOrganizer}
      onPinMessage={handlePinMessage}
      onReact={handleReact}
    />
  );
}
