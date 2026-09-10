'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import ErrorState from '@/components/ErrorState';
import LoadingState from '@/components/LoadingState';
import ChatScreen, { type PinnedMessage } from '@/components/ChatScreen';
import TypingBubble from '@/components/TypingBubble';
import Avatar from '@/components/Avatar';
import { useImageUpload } from '@/hooks/useImageUpload';
import { COLORS, RADIUS, SHADOW, FONT } from '@/lib/designTokens';

type Message = {
  id: string;
  group_id: string;
  author_id: string;
  text: string;
  image_url: string | null;
  created_at: string;
  author: { id: string; name: string; avatar_color: string; avatar_url?: string | null } | null;
  reactions?: { emoji: string; count: number; reactedByMe: boolean }[];
};

type GroupInfo = { id: string; name: string; description: string | null; is_public: boolean; isMember: boolean; isPending?: boolean; member_count: number; avatar_color?: string; creator_id: string };
type Member = { role: 'admin' | 'member'; joined_at: string; profile: { id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null } };
type UserResult = { id: string; name: string; handle: string; avatar_color: string; avatar_url?: string | null };

export default function GroupThreadPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [meId, setMeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // Kept in sync via the effect below — same reasoning as the identical
  // pattern in the activity chat page: the realtime subscription is set
  // up once and doesn't depend on messages, so its callbacks need a ref
  // to read the current list rather than a stale closure.
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage>(null);
  const [text, setText] = useState('');
  // Map of userId -> name, not just a boolean — group chats can have
  // multiple people typing at once, unlike a DM's single other person.
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Fetched once, directly — not from the members list, which is only
  // ever populated when someone opens the "Manage Members" panel and
  // otherwise stays empty for the whole session. That's what was actually
  // causing every typing broadcast to fall back to "Someone": the lookup
  // logic wasn't wrong, the list it searched was just never populated in
  // normal chat usage.
  const myNameRef = useRef<string>('Someone');
  const typingClearTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingSentAt = useRef(0);

  // Throttled — sent at most once every 2 seconds while actively typing,
  // not on every keystroke. See the identical pattern (and full reasoning)
  // in the DM conversation page.
  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAt.current < 2000) return;
    lastTypingSentAt.current = now;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: meId, name: myNameRef.current } });
  }
  const [stagedImage, setStagedImage] = useState<{ previewUrl: string; uploadedUrl: string | null; uploading: boolean; progress: number; error: string | null } | null>(null);
  const chatImageUpload = useImageUpload('chat-images');
  const [sending, setSending] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Add People sheet
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Manage Members sheet
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  async function loadGroupInfo() {
    const res = await fetch('/api/groups');
    const json = await res.json();
    const g = (json.groups || []).find((x: GroupInfo) => x.id === params.id);
    setGroup(g ?? null);
    return g;
  }

  async function loadMessages() {
    const messagesJson = await fetch(`/api/groups/${params.id}/messages`).then((r) => r.json());
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

        const g = await loadGroupInfo();
        if (cancelled) return;
        if (!g?.isMember) { setLoading(false); return; } // don't fetch messages or subscribe if not a member yet

        // My own role in this group — determines whether Add People / pin
        // controls show at all. RLS already lets a member see their own row.
        const { data: myMembership } = await supabase
          .from('group_members')
          .select('role')
          .eq('group_id', params.id)
          .eq('user_id', data.user.id)
          .maybeSingle();
        if (cancelled) return;
        setIsAdmin(myMembership?.role === 'admin');

        await loadMessages();
        if (cancelled) return;
        setLoading(false);

        // Mark read now that the chat is actually open — a deliberate
        // "I'm looking at this" action, not a side effect of merely
        // fetching messages (loadMessages() is also called on reaction
        // updates, which shouldn't silently mark things read).
        fetch(`/api/groups/${params.id}/read`, { method: 'PATCH' }).catch(() => {});

        channel = supabase
          .channel(`group-${params.id}`, { config: { broadcast: { self: false }, private: false } })
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${params.id}` },
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
              // Still on this screen when a new message arrives — that's
              // still "read" the moment it shows up, so keep last_read_at
              // current rather than let it lag behind while the chat stays open.
              fetch(`/api/groups/${params.id}/read`, { method: 'PATCH' }).catch(() => {});
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'group_message_reactions' },
            (payload) => {
              // Same reasoning as the identical guard in the activity chat
              // page: this table has no group_id column to filter on
              // server-side (only message_id), so this subscription
              // necessarily receives every group's reaction events
              // platform-wide. This guard is what stops that from meaning
              // a full refetch for every other group's reactions too.
              const messageId = (payload.new as any)?.message_id ?? (payload.old as any)?.message_id;
              const belongsHere = messagesRef.current.some((m) => m.id === messageId);
              if (belongsHere) loadMessages();
            }
          )
          // Broadcast, not postgres_changes — typing status is deliberately
          // never persisted to the database (there's no reason to store
          // "was typing at 3:04pm" anywhere); broadcast is Supabase
          // Realtime's purpose-built tool for exactly this kind of
          // ephemeral, low-latency signaling.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function handleJoin() {
    setJoining(true);
    await fetch(`/api/groups/${params.id}/join`, { method: 'POST' });
    setJoining(false);
    window.location.reload();
  }

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
    const res = await fetch(`/api/groups/${params.id}/messages`, {
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
    }
  }

  async function handleReact(messageId: string, emoji: string) {
    // Optimistic update so the tap feels instant; the Realtime subscription
    // above will reconcile with the server's aggregated count shortly after
    // regardless, so this doesn't need to be perfectly accurate on its own.
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
    await fetch(`/api/groups/${params.id}/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji })
    });
  }

  async function handlePinMessage(messageId: string) {
    const res = await fetch(`/api/groups/${params.id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    await loadMessages();
  }

  async function handleUnpinMessage() {
    await fetch(`/api/groups/${params.id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: null })
    });
    setPinnedMessage(null);
  }

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const json = await res.json();
      setSearchResults(json.users || []);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  async function handleAddPerson(userId: string) {
    const res = await fetch(`/api/groups/${params.id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    // Not incrementing member_count here — this is a pending invite, not
    // active membership yet. member_count only counts active members, and
    // will correctly reflect this person once they accept.
    setAddedIds((prev) => new Set(prev).add(userId));
  }

  async function openManageMembers() {
    setManageMembersOpen(true);
    setMembersLoading(true);
    const res = await fetch(`/api/groups/${params.id}/members`);
    const json = await res.json();
    setMembers(json.members || []);
    setMembersLoading(false);
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm('Remove this person from the group?')) return;
    const res = await fetch(`/api/groups/${params.id}/members/${userId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    setMembers((prev) => prev.filter((m) => m.profile.id !== userId));
    setGroup((prev) => prev ? { ...prev, member_count: Math.max(prev.member_count - 1, 0) } : prev);
  }

  async function handleToggleRole(userId: string, currentRole: 'admin' | 'member') {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    const res = await fetch(`/api/groups/${params.id}/members/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    setMembers((prev) => prev.map((m) => (m.profile.id === userId ? { ...m, role: newRole } : m)));
  }

  async function handleDeleteGroup() {
    if (!confirm(`Delete "${group?.name}"? This removes the group and its entire message history for everyone. This cannot be undone.`)) return;
    const res = await fetch(`/api/groups/${params.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    window.location.href = '/inbox';
  }

  if (error) {
    return <ErrorState message="Couldn't load this group." onRetry={() => window.location.reload()} />;
  }
  if (loading) {
    return <LoadingState />;
  }
  if (!group) {
    return <div style={{ padding: 40, color: COLORS.textSecondary }}>Group not found.</div>;
  }

  if (!group.isMember) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <h2 style={{ ...FONT.sectionTitle, marginBottom: 8 }}>{group.name}</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>
          {group.isPending
            ? "You've been invited to this group — accept or decline from your Notifications."
            : group.is_public
            ? "You're not in this group yet. Join to see and send messages."
            : "This is a private group and you haven't been invited."}
        </p>
        {group.isPending ? (
          <Link href="/notifications" style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 12, background: COLORS.violet, color: '#fff', fontWeight: 700, textDecoration: 'none' }}>
            Go to Notifications
          </Link>
        ) : group.is_public && (
          <button
            onClick={handleJoin}
            disabled={joining}
            style={{ padding: '11px 22px', borderRadius: 12, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            {joining ? 'Joining…' : 'Join Group'}
          </button>
        )}
        <div style={{ marginTop: 16 }}>
          <Link href="/groups" style={{ color: COLORS.violet, fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>← Back to Groups</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatScreen
        headerAvatarColor={group.avatar_color || '#7A5AF8'}
        headerTitle={group.name}
        headerSubtitle={`${group.member_count} member${group.member_count === 1 ? '' : 's'} · ${group.is_public ? 'Public' : 'Private'}`}
        typingIndicator={Object.keys(typingUsers).length > 0 ? <TypingBubble label={Object.values(typingUsers).join(', ')} /> : null}
        backHref="/inbox"
        headerRight={isAdmin && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setAddPeopleOpen(true)}
              aria-label="Add people"
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: COLORS.violetTint, color: COLORS.violet, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
            </button>
            <button
              onClick={openManageMembers}
              aria-label="Manage members"
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: COLORS.violetTint, color: COLORS.violet, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /><line x1="17.5" y1="15" x2="9" y2="15" /></svg>
            </button>
          </div>
        )}
        messages={messages}
        meId={meId}
        emptyMessage="No messages yet — say hello."
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
        canManagePins={isAdmin}
        onPinMessage={handlePinMessage}
        onReact={handleReact}
      />

      {addPeopleOpen && (
        <div onClick={() => setAddPeopleOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px 20px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 16px auto', flexShrink: 0 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 14, flexShrink: 0 }}>Add People</div>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name…"
              style={{ width: '100%', padding: '11px 16px', borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceAlt, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12, flexShrink: 0 }}
            />
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {searchResults.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
                  <Avatar name={u.name} color={u.avatar_color} avatarUrl={u.avatar_url} size="md" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textFaint }}>@{u.handle}</div>
                  </div>
                  <button
                    onClick={() => handleAddPerson(u.id)}
                    disabled={addedIds.has(u.id)}
                    style={{
                      padding: '7px 16px', borderRadius: RADIUS.pill, fontSize: 12.5, fontWeight: 700, flexShrink: 0,
                      border: 'none', cursor: addedIds.has(u.id) ? 'default' : 'pointer',
                      background: addedIds.has(u.id) ? COLORS.surfaceAlt : COLORS.violet,
                      color: addedIds.has(u.id) ? COLORS.textFaint : '#fff'
                    }}
                  >
                    {addedIds.has(u.id) ? 'Invited' : 'Add'}
                  </button>
                </div>
              ))}
              {searchQuery.trim() && searchResults.length === 0 && (
                <p style={{ fontSize: 13, color: COLORS.textFaint, textAlign: 'center', padding: '20px 0' }}>No one found.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {manageMembersOpen && (
        <div onClick={() => setManageMembersOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px 20px', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 16px auto', flexShrink: 0 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 14, flexShrink: 0 }}>Manage Members</div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {membersLoading && <LoadingState />}
              {!membersLoading && members.map((m) => {
                const isMe = m.profile.id === meId;
                return (
                  <div key={m.profile.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
                    <Avatar name={m.profile.name} color={m.profile.avatar_color} avatarUrl={m.profile.avatar_url} size="md" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{m.profile.name}{isMe ? ' (you)' : ''}</div>
                      <div style={{ fontSize: 12, color: COLORS.textFaint }}>{m.role === 'admin' ? 'Admin' : 'Member'}</div>
                    </div>
                    {!isMe && (
                      <>
                        <button
                          onClick={() => handleToggleRole(m.profile.id, m.role)}
                          style={{ padding: '6px 12px', borderRadius: RADIUS.pill, fontSize: 12, fontWeight: 700, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.textSecondary, cursor: 'pointer', flexShrink: 0 }}
                        >
                          {m.role === 'admin' ? 'Demote' : 'Make admin'}
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m.profile.id)}
                          aria-label={`Remove ${m.profile.name}`}
                          style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: COLORS.surfaceAlt, color: COLORS.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {group.creator_id === meId && (
              <button
                onClick={handleDeleteGroup}
                style={{ marginTop: 16, padding: '11px 16px', borderRadius: 12, border: `1px solid ${COLORS.danger}`, background: '#fff', color: COLORS.danger, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', flexShrink: 0 }}
              >
                Delete Group
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
