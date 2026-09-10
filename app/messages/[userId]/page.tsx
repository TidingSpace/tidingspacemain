'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import ErrorState from '@/components/ErrorState';
import MediaLightbox from '@/components/MediaLightbox';
import LoadingState from '@/components/LoadingState';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import TypingBubble from '@/components/TypingBubble';
import EmojiPicker from '@/components/EmojiPicker';
import { useImageUpload } from '@/hooks/useImageUpload';
import { COLORS, SHADOW, RADIUS } from '@/lib/designTokens';
import { isOnline } from '@/lib/presence';

type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  image_url: string | null;
  read_at: string | null;
  created_at: string;
};

type OtherUser = { id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null; last_seen_at: string | null; is_verified_organizer?: boolean };

function formatDateSeparator(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function ThreadPage({ params }: { params: { userId: string } }) {
  const supabase = createClient();
  const [meId, setMeId] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isBlockedEitherWay, setIsBlockedEitherWay] = useState(false);
  const [expandedSeenId, setExpandedSeenId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const myIdRef = useRef<string | null>(null);
  const typingClearTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAt = useRef(0);

  // Throttled, not sent on every keystroke — a broadcast on literally every
  // character typed would be frequent and pointless, since the receiving
  // side only needs to know "still typing, roughly now" often enough to
  // keep its own 3-second auto-clear timer topped up (see the broadcast
  // listener above). Once every 2 seconds while actively typing is plenty.
  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentAt.current < 2000) return;
    lastTypingSentAt.current = now;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: myIdRef.current } });
  }
  const [stagedImage, setStagedImage] = useState<{ previewUrl: string; uploadedUrl: string | null; uploading: boolean; progress: number; error: string | null } | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const chatImageUpload = useImageUpload('chat-images');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Spam');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function handleBlock() {
    if (!confirm('Block this person? They will no longer be able to message you.')) return;
    await fetch(`/api/blocks/${params.userId}`, { method: 'POST' });
    window.location.href = '/inbox';
  }

  async function handleReportSubmit() {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_user_id: params.userId, reason: reportReason })
    });
    const json = await res.json();
    setReportOpen(false);
    setMenuOpen(false);
    if (json.error) { alert(json.error); return; }
    alert('Thanks — this has been reported for review.');
  }

  // Load who I am, then the thread, then subscribe to live updates
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
        const myId = data.user.id;
        myIdRef.current = myId;

        const json = await fetch(`/api/messages/${params.userId}`).then((r) => r.json());
        if (cancelled) return;
        setMessages(json.messages || []);
        setOtherUser(json.otherUser ?? null);
        setIsBlockedEitherWay(!!json.isBlockedEitherWay);
        setLoading(false);

        // Live updates: new messages, and read-receipt updates on messages I sent.
        // Both subscriptions are now server-side filtered — previously
        // neither had any filter at all, meaning this component received
        // every direct message insert/update on the entire platform, for
        // every user's conversation, not just this one. INSERT only needs
        // messages sent BY the other person specifically: my own sent
        // messages are already added optimistically the moment I send them
        // (see the plain send handler below), so this subscription never
        // needed to echo my own messages back to me in the first place.
        channel = supabase
          // Sorted, not just params.userId — broadcast (used below for
          // typing status) fundamentally requires both participants to be
          // on the EXACT SAME channel name to ever receive each other's
          // messages, unlike postgres_changes, which doesn't care about
          // channel names at all (it's driven by the database's own
          // replication stream, not a shared "room"). Using
          // `dm-${params.userId}` meant each person computed a DIFFERENT
          // channel name for the same conversation (my channel is
          // dm-{their-id}, their channel is dm-{my-id}) — two different
          // rooms that could never hear each other's broadcasts. Sorting
          // both IDs makes the name canonical regardless of who's viewing.
          .channel(`dm-${[myId, params.userId].sort().join('-')}`, { config: { broadcast: { self: false }, private: false } })
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${params.userId}` },
            (payload) => {
              const m = payload.new as Message;
              if (m.recipient_id !== myId) return; // belt-and-suspenders: the filter alone can't express the AND on recipient_id
              setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
              // Any real message arriving means they're done typing — stop
              // waiting for the separate "stopped typing" broadcast, which
              // may lag slightly behind the message itself arriving.
              setOtherUserTyping(false);
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${myId}` },
            (payload) => {
              const m = payload.new as Message;
              setMessages((prev) => prev.map((p) => (p.id === m.id ? { ...p, read_at: m.read_at } : p)));
            }
          )
          // Broadcast, not postgres_changes — typing status is deliberately
          // never written to the database at all. It's ephemeral by nature
          // (nobody needs a persistent record of "was typing at 3:04pm"),
          // so a real table write for every keystroke would be pure waste;
          // Supabase's broadcast channel type exists exactly for this kind
          // of low-latency, non-persisted signaling between clients.
          .on('broadcast', { event: 'typing' }, ({ payload }) => {
            if (payload?.userId !== params.userId) return;
            setOtherUserTyping(true);
            // Auto-clears after a pause with no further "still typing"
            // broadcasts — covers the case where the other person closes
            // the app or loses connection mid-type, rather than leaving
            // "typing…" stuck on screen forever.
            if (typingClearTimeout.current) clearTimeout(typingClearTimeout.current);
            typingClearTimeout.current = setTimeout(() => setOtherUserTyping(false), 3000);
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
      if (typingClearTimeout.current) clearTimeout(typingClearTimeout.current);
    };
  }, [params.userId, supabase]);

  const hasScrolledInitially = useRef(false);

  useEffect(() => {
    // See ChatScreen.tsx for the full reasoning — instant jump on the first
    // load (opening the conversation), smooth animation for messages that
    // arrive afterward, plus a cheap re-check shortly after in case an image
    // further down the thread was still loading when the first scroll ran.
    const behavior = hasScrolledInitially.current ? 'smooth' : 'auto';
    bottomRef.current?.scrollIntoView({ behavior });
    hasScrolledInitially.current = true;

    const recheck = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 300);
    return () => clearTimeout(recheck);
  }, [messages]);

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
    const res = await fetch(`/api/messages/${params.userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), image_url: stagedImage?.uploadedUrl ?? null })
    });
    const json = await res.json();
    setSending(false);
    if (json.message) {
      setText('');
      setStagedImage(null);
      // Optimistic add — the Realtime event will also arrive but is deduped above
      setMessages((prev) => [...prev, json.message]);
      if (json.isBlockedEitherWay) setIsBlockedEitherWay(true);
    } else if (json.error) {
      alert(json.error);
    }
  }

  if (error) {
    return <ErrorState message="Couldn't load this conversation." onRetry={() => window.location.reload()} />;
  }
  if (loading) {
    return <LoadingState />;
  }

  // Group messages into day buckets, then into consecutive-sender runs within
  // each day — this drives both the date separators and the visual grouping
  // (only the last message in a run shows a timestamp + read receipt).
  const dayGroups: { label: string; messages: Message[] }[] = [];
  messages.forEach((m) => {
    const label = formatDateSeparator(m.created_at);
    const lastGroup = dayGroups[dayGroups.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.messages.push(m);
    else dayGroups.push({ label, messages: [m] });
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <style>{`
        @keyframes messageIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .ts-message-in { animation: messageIn 0.22s ease; }
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}`, boxShadow: SHADOW.card }}>
          <Link href="/inbox" style={{ color: COLORS.ink, textDecoration: 'none', display: 'flex', flexShrink: 0 }} aria-label="Back">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar name={otherUser?.name || '?'} color={otherUser?.avatar_color} avatarUrl={otherUser?.avatar_url} size="md" />
            <div style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: isOnline(otherUser?.last_seen_at ?? null) ? COLORS.success : '#B0B0B8', border: '2px solid #fff' }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
              {otherUser?.name || 'Conversation'}
              {otherUser?.is_verified_organizer && <VerifiedBadge size={16} />}
            </div>
            {otherUser?.handle && (
              <div style={{ fontSize: 12, color: COLORS.textFaint }}>@{otherUser.handle}</div>
            )}
          </div>

          <button onClick={() => alert('Voice calling — coming soon.')} aria-label="Voice call" style={headerIconBtn}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </button>
          <button onClick={() => alert('Video calling — coming soon.')} aria-label="Video call" style={headerIconBtn}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
          </button>
          <button onClick={() => setMenuOpen(!menuOpen)} aria-label="More" style={headerIconBtn}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill={COLORS.ink}><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
        </div>

        {menuOpen && (
          <div style={{ position: 'absolute', top: 60, right: 16, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: SHADOW.raised, overflow: 'hidden', zIndex: 10, minWidth: 160 }}>
            <button onClick={() => { setReportOpen(true); setMenuOpen(false); }} style={menuItemStyle}>Report</button>
            <button onClick={handleBlock} style={{ ...menuItemStyle, color: COLORS.danger }}>Block</button>
          </div>
        )}
      </div>

      {reportOpen && (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surfaceAlt }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Report this person</div>
          <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} style={{ width: '100%', padding: 9, borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13, marginBottom: 8 }}>
            <option>Spam</option>
            <option>Harassment or abuse</option>
            <option>Inappropriate content</option>
            <option>Impersonation</option>
            <option>Other</option>
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReportSubmit} style={{ flex: 1, padding: 9, borderRadius: 8, border: 'none', background: COLORS.danger, color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Submit Report</button>
            <button onClick={() => setReportOpen(false)} style={{ padding: '9px 14px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#fff', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 20px 18px 20px', background: `linear-gradient(180deg, ${COLORS.chatBg} 0%, #FBFAFF 100%)` }}>
        {dayGroups.map((group, gi) => (
          <div key={gi}>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0 14px 0' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.textFaint, background: COLORS.violetTint, padding: '5px 14px', borderRadius: RADIUS.pill }}>
                {group.label}
              </span>
            </div>

            {group.messages.map((m, i) => {
              const mine = m.sender_id === meId;
              const prevSameSender = i > 0 && group.messages[i - 1].sender_id === m.sender_id;
              const nextSameSender = i < group.messages.length - 1 && group.messages[i + 1].sender_id === m.sender_id;
              const isLastInRun = !nextSameSender;

              return (
                <div key={m.id} className="ts-message-in" style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: isLastInRun ? 14 : 3, marginTop: prevSameSender ? 0 : 4 }}>
                  <div
                    onClick={() => { if (mine && m.read_at) setExpandedSeenId((prev) => (prev === m.id ? null : m.id)); }}
                    style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', cursor: mine && m.read_at ? 'pointer' : 'default' }}
                  >
                    {m.image_url && (
                      <div style={{
                        padding: 5, background: mine ? COLORS.violet : '#fff', borderRadius: 20,
                        marginBottom: m.text ? 4 : 0, boxShadow: mine ? 'none' : SHADOW.card
                      }}>
                        <img
                          src={m.image_url}
                          alt=""
                          loading="lazy"
                          onClick={(e) => { e.stopPropagation(); setLightboxUrl(m.image_url!); }}
                          style={{ width: '100%', maxWidth: 230, borderRadius: 16, display: 'block', cursor: 'pointer' }}
                        />
                      </div>
                    )}
                    {m.text && (
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: 18,
                        background: mine ? COLORS.violet : '#fff',
                        color: mine ? '#fff' : COLORS.ink,
                        fontSize: 14, lineHeight: 1.45,
                        boxShadow: mine ? 'none' : SHADOW.card
                      }}>
                        {m.text}
                      </div>
                    )}

                    {isLastInRun && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '0 4px' }}>
                        <span style={{ fontSize: 10.5, color: COLORS.textFaint }}>{formatTime(m.created_at)}</span>
                        {mine && (
                          <>
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={m.read_at ? COLORS.violet : COLORS.textFaint} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={m.read_at ? 'Read' : 'Sent'}>
                              <polyline points="1 12 6 17 13 8" />
                              <polyline points="9 12 14 17 23 6" />
                            </svg>
                            {m.read_at && <span style={{ fontSize: 10.5, color: COLORS.violet, fontWeight: 600 }}>Seen</span>}
                          </>
                        )}
                      </div>
                    )}
                    {mine && m.read_at && expandedSeenId === m.id && (
                      <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginTop: 2, padding: '0 4px' }}>
                        Seen {formatTime(m.read_at)}
                      </div>
                    )}
                    {isLastInRun && mine && isBlockedEitherWay && (
                      <div style={{ fontSize: 10.5, color: COLORS.danger, marginTop: 2, padding: '0 4px' }}>
                        Recipient has restricted access
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {otherUserTyping && <TypingBubble label={otherUser?.name} />}
        <div ref={bottomRef} />
      </div>

      {stagedImage && (
        <div style={{ padding: '10px 20px 0 20px', borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ position: 'relative', width: 64, height: 64, borderRadius: RADIUS.sm, overflow: 'hidden' }}>
            <img src={stagedImage.previewUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {stagedImage.uploading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,24,48,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                {Math.round(stagedImage.progress * 100)}%
              </div>
            )}
            <button
              onClick={removeStagedImage}
              aria-label="Remove image"
              style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: 10 }}
            >
              ✕
            </button>
          </div>
          {stagedImage.error && <p style={{ color: COLORS.danger, fontSize: 11.5, marginTop: 4 }}>{stagedImage.error}</p>}
        </div>
      )}

      {/* Composer */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: `10px 16px calc(10px + env(safe-area-inset-bottom, 0px)) 16px`, borderTop: stagedImage ? 'none' : `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <button
          onClick={() => setAttachSheetOpen(true)}
          aria-label="Add attachment"
          style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0, background: COLORS.violetTint, color: COLORS.violet, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleAttachImage} />

        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); notifyTyping(); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Message…"
            style={{ width: '100%', padding: '10px 68px 10px 16px', borderRadius: RADIUS.pill, border: 'none', background: COLORS.surfaceAlt, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ position: 'absolute', right: 6, display: 'flex', gap: 2 }}>
            <button onClick={() => setEmojiPickerOpen(!emojiPickerOpen)} aria-label="Emoji" style={composerInlineBtn}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
            </button>
            <button onClick={() => imageInputRef.current?.click()} aria-label="Attach image" style={composerInlineBtn}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={COLORS.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
            </button>
          </div>
          {emojiPickerOpen && (
            <EmojiPicker onSelect={(emoji) => setText(text + emoji)} />
          )}
        </div>

        <button
          onClick={() => {
            if (text.trim() || stagedImage?.uploadedUrl) handleSend();
            else alert('Voice messages — coming soon.');
          }}
          disabled={sending}
          aria-label={text.trim() || stagedImage?.uploadedUrl ? 'Send' : 'Record voice message'}
          style={{
            width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0,
            background: (text.trim() || stagedImage?.uploadedUrl) ? COLORS.violet : COLORS.surfaceAlt,
            color: (text.trim() || stagedImage?.uploadedUrl) ? '#fff' : COLORS.violet,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: (text.trim() || stagedImage?.uploadedUrl) ? '0 4px 12px rgba(122,90,248,0.4)' : 'none',
            transition: 'background 0.15s ease, box-shadow 0.15s ease'
          }}
        >
          {(text.trim() || stagedImage?.uploadedUrl) ? (
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></svg>
          )}
        </button>
      </div>

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

      {/* Attachment sheet */}
      {attachSheetOpen && (
        <div onClick={() => setAttachSheetOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px 20px', animation: 'sheetUp 0.22s ease' }}
          >
            <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 20px auto' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
              <AttachOption
                icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>}
                label="Photos"
                onClick={() => { setAttachSheetOpen(false); imageInputRef.current?.click(); }}
              />
              <AttachOption
                icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>}
                label="Camera"
                onClick={() => { setAttachSheetOpen(false); alert('Camera capture — coming soon.'); }}
              />
              <AttachOption
                icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>}
                label="Files"
                onClick={() => { setAttachSheetOpen(false); alert('File attachments — coming soon.'); }}
              />
              <AttachOption
                icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>}
                label="Location"
                onClick={() => { setAttachSheetOpen(false); alert('Sharing your location — coming soon.'); }}
              />
              <AttachOption
                icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                label="Activity"
                onClick={() => { setAttachSheetOpen(false); alert('Sharing an activity in DMs — coming soon.'); }}
              />
              <AttachOption
                icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M7 8h10M7 12h6" /></svg>}
                label="GIF"
                onClick={() => { setAttachSheetOpen(false); alert('GIF search — coming soon.'); }}
              />
              <AttachOption
                icon={<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>}
                label="Poll"
                onClick={() => { setAttachSheetOpen(false); alert('Polls — coming in a future update.'); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AttachOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.textSecondary }}>{label}</span>
    </button>
  );
}

const headerIconBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
};

const composerInlineBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
};

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px',
  border: 'none', background: 'none', fontSize: 13.5, fontWeight: 600, color: COLORS.ink, cursor: 'pointer'
};
