'use client';

import { useEffect, useRef, useState } from 'react';
import MediaLightbox from '@/components/MediaLightbox';
import EmptyState from '@/components/EmptyState';
import EmojiPicker from '@/components/EmojiPicker';
import Avatar from '@/components/Avatar';
import { COLORS, RADIUS, SHADOW, FONT } from '@/lib/designTokens';

// Shared by Group Chat and Community Chat — functionally the same interface
// (a member list, a message stream, image attachments, Realtime updates)
// with different data sources underneath. This component only handles
// rendering; each page keeps its own data-fetching, Realtime subscription,
// and send/upload logic exactly as before, passing the result in as props.
// That split means neither page's actual behavior changed here — only how
// the result gets drawn on screen.
export type Reaction = { emoji: string; count: number; reactedByMe: boolean };

export type ChatMessage = {
  id: string;
  author_id: string;
  text: string | null;
  image_url: string | null;
  created_at: string;
  author: { id: string; name: string; avatar_color?: string; avatar_url?: string | null } | null;
  reactions?: Reaction[];
  // Not set anywhere in current data — no backend concept of a system
  // message (join/leave/activity-started) exists yet. Supported here only
  // so the visual treatment exists if that's ever added later; nothing
  // produces one today, so this never renders in practice.
  is_system?: boolean;
  system_text?: string;
};

export type PinnedMessage = { id: string; text: string | null; image_url: string | null; author: { name: string } | null } | null;

// The fixed reaction set — matches the API's ALLOWED_EMOJI exactly. A small,
// curated set rather than a full emoji keyboard, consistent with the
// "compact floating reaction pill" pattern rather than a general-purpose
// picker.
export const QUICK_REACTIONS = ['❤️', '👍', '😂', '🔥', '🙏'];

export type StagedImage = {
  previewUrl: string;
  uploadedUrl: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
} | null;

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

export default function ChatScreen({
  headerAvatarColor,
  headerAvatarUrl,
  headerTitle,
  headerSubtitle,
  backHref,
  headerRight,
  messages,
  typingIndicator,
  meId,
  emptyMessage,
  text,
  onTextChange,
  onSend,
  sending,
  stagedImage,
  onFileSelected,
  onRemoveStagedImage,
  placeholder,
  lightboxUrl,
  onSetLightboxUrl,
  pinnedMessage,
  onUnpinMessage,
  canManagePins = false,
  onPinMessage,
  onReact
}: {
  headerAvatarColor: string;
  headerAvatarUrl?: string | null;
  headerTitle: string;
  headerSubtitle: string;
  backHref: string;
  headerRight?: React.ReactNode;
  messages: ChatMessage[];
  // Rendered right before the scroll anchor, in the same spot the next
  // real message from that person would appear — not in the header.
  typingIndicator?: React.ReactNode;
  meId: string | null;
  emptyMessage: string;
  text: string;
  onTextChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  stagedImage: StagedImage;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveStagedImage: () => void;
  placeholder: string;
  lightboxUrl: string | null;
  onSetLightboxUrl: (url: string | null) => void;
  pinnedMessage?: PinnedMessage;
  onUnpinMessage?: () => void;
  canManagePins?: boolean;
  onPinMessage?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledInitially = useRef(false);
  const [pickerForMessage, setPickerForMessage] = useState<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  useEffect(() => {
    // The very first scroll (opening the conversation) jumps straight to the
    // bottom instantly — a "smooth" animated scroll across a full message
    // history looks like it stops partway, especially on a longer thread.
    // Every scroll after that (a new message arriving while already open)
    // still animates smoothly, which is the nicer behavior there.
    const behavior = hasScrolledInitially.current ? 'smooth' : 'auto';
    bottomRef.current?.scrollIntoView({ behavior });
    hasScrolledInitially.current = true;

    // Images finish loading asynchronously — if one further down the thread
    // hasn't loaded yet at the moment of the scroll above, the container's
    // true height (and therefore its actual bottom) isn't final yet, and the
    // scroll above lands short of it. A single, cheap re-check shortly after
    // catches this without needing a full ResizeObserver for what's a rare,
    // minor timing gap.
    const recheck = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 300);
    return () => clearTimeout(recheck);
  }, [messages]);

  const dayGroups: { label: string; messages: ChatMessage[] }[] = [];
  messages.forEach((m) => {
    const label = formatDateSeparator(m.created_at);
    const lastGroup = dayGroups[dayGroups.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.messages.push(m);
    else dayGroups.push({ label, messages: [m] });
  });

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <style>{`
        @keyframes chatMessageIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .chat-message-in { animation: chatMessageIn 0.22s ease; }
      `}</style>

      {/* Header — matches Conversation's exact custom pattern (avatar,
          title, subtitle, back, right-side icon slot) rather than
          PageHeader, which doesn't support this richer shape and shouldn't
          be generalized just for chat screens. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}`, boxShadow: SHADOW.card, flexShrink: 0 }}>
        <a href={backHref} style={{ color: COLORS.ink, textDecoration: 'none', display: 'flex', flexShrink: 0 }} aria-label="Back">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </a>
        <Avatar name={headerTitle} color={headerAvatarColor} avatarUrl={headerAvatarUrl} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...FONT.cardTitle, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {headerTitle}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textFaint }}>{headerSubtitle}</div>
        </div>
        {headerRight}
      </div>

      {pinnedMessage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: COLORS.violetTint, borderBottom: `1px solid ${COLORS.border}` }}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={COLORS.violetDeep} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14l-1.4-7.5a2 2 0 0 0-2-1.5H8.4a2 2 0 0 0-2 1.5z" /><path d="M9 2h6l-.5 6h-5z" /></svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.violetDeep }}>Pinned{pinnedMessage.author?.name ? ` · ${pinnedMessage.author.name}` : ''}</div>
            <div style={{ fontSize: 12.5, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pinnedMessage.text || (pinnedMessage.image_url ? 'Photo' : '')}
            </div>
          </div>
          {canManagePins && onUnpinMessage && (
            <button onClick={onUnpinMessage} aria-label="Unpin" style={{ background: 'none', border: 'none', color: COLORS.textFaint, cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>✕</button>
          )}
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
              if (m.is_system) {
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
                    <span style={{ fontSize: 11.5, color: COLORS.textFaint, background: COLORS.surfaceAlt, padding: '5px 14px', borderRadius: RADIUS.pill, textAlign: 'center' }}>
                      {m.system_text}
                    </span>
                  </div>
                );
              }

              const mine = m.author_id === meId;
              const prevSameSender = i > 0 && !group.messages[i - 1].is_system && group.messages[i - 1].author_id === m.author_id;
              const nextSameSender = i < group.messages.length - 1 && !group.messages[i + 1].is_system && group.messages[i + 1].author_id === m.author_id;
              const isLastInRun = !nextSameSender;
              const showAvatarAndName = !mine && !prevSameSender;

              return (
                <div key={m.id} className="chat-message-in" style={{ display: 'flex', gap: 8, marginBottom: isLastInRun ? 14 : 3, marginTop: prevSameSender ? 0 : 4, flexDirection: mine ? 'row-reverse' : 'row' }}>
                  {!mine && (
                    <div style={{ width: 30, flexShrink: 0 }}>
                      {showAvatarAndName && <Avatar name={m.author?.name || '?'} color={m.author?.avatar_color} avatarUrl={m.author?.avatar_url} size="sm" />}
                    </div>
                  )}
                  <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    {showAvatarAndName && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.violetDeep, marginBottom: 3, marginLeft: 2 }}>{m.author?.name}</div>
                    )}
                    {m.image_url && (
                      <div style={{ padding: 5, background: mine ? COLORS.violet : '#fff', borderRadius: 20, marginBottom: m.text ? 4 : 0, boxShadow: mine ? 'none' : SHADOW.card }}>
                        <img
                          src={m.image_url}
                          alt=""
                          loading="lazy"
                          onClick={() => onSetLightboxUrl(m.image_url!)}
                          style={{ width: '100%', maxWidth: 220, borderRadius: 16, display: 'block', cursor: 'pointer' }}
                        />
                      </div>
                    )}
                    {m.text && (
                      <div style={{
                        padding: '10px 14px', borderRadius: 18,
                        background: mine ? COLORS.violet : '#fff',
                        color: mine ? '#fff' : COLORS.ink,
                        fontSize: FONT.body.fontSize, lineHeight: FONT.body.lineHeight,
                        boxShadow: mine ? 'none' : SHADOW.card
                      }}>
                        {m.text}
                      </div>
                    )}
                    {isLastInRun && (
                      <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginTop: 4, padding: '0 4px' }}>{formatTime(m.created_at)}</div>
                    )}

                    {/* Aggregated reaction pills — each tappable to toggle your own reaction */}
                    {m.reactions && m.reactions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {m.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            onClick={() => onReact?.(m.id, r.emoji)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: RADIUS.pill,
                              border: `1px solid ${r.reactedByMe ? COLORS.violet : COLORS.border}`,
                              background: r.reactedByMe ? COLORS.violetTint : '#fff',
                              fontSize: 12, cursor: 'pointer'
                            }}
                          >
                            <span>{r.emoji}</span>
                            <span style={{ color: r.reactedByMe ? COLORS.violetDeep : COLORS.textSecondary, fontWeight: 600 }}>{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Quick actions: react, and (admins/organizer only) pin */}
                    {(onReact || (canManagePins && onPinMessage)) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 3, position: 'relative' }}>
                        {onReact && (
                          <button
                            onClick={() => setPickerForMessage(pickerForMessage === m.id ? null : m.id)}
                            aria-label="Add reaction"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textFaint, fontSize: 13, padding: 2, display: 'flex', alignItems: 'center', gap: 2 }}
                          >
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                          </button>
                        )}
                        {canManagePins && onPinMessage && (
                          <button
                            onClick={() => onPinMessage(m.id)}
                            aria-label="Pin message"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textFaint, fontSize: 13, padding: 2, display: 'flex', alignItems: 'center' }}
                          >
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14l-1.4-7.5a2 2 0 0 0-2-1.5H8.4a2 2 0 0 0-2 1.5z" /><path d="M9 2h6l-.5 6h-5z" /></svg>
                          </button>
                        )}

                        {pickerForMessage === m.id && (
                          <div style={{
                            position: 'absolute', bottom: 22, [mine ? 'right' : 'left']: 0,
                            display: 'flex', gap: 4, background: '#fff', borderRadius: RADIUS.pill, padding: '6px 10px',
                            boxShadow: SHADOW.raised, zIndex: 10
                          }}>
                            {QUICK_REACTIONS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => { onReact?.(m.id, emoji); setPickerForMessage(null); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 2 }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {messages.length === 0 && <EmptyState message={emptyMessage} />}
        {typingIndicator}
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
              onClick={onRemoveStagedImage}
              aria-label="Remove image"
              style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: 10 }}
            >
              ✕
            </button>
          </div>
          {stagedImage.error && <p style={{ color: COLORS.danger, fontSize: 11.5, marginTop: 4 }}>{stagedImage.error}</p>}
        </div>
      )}

      {/* Composer — matches Conversation's exact structure */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: `10px 16px calc(10px + env(safe-area-inset-bottom, 0px)) 16px`, borderTop: stagedImage ? 'none' : `1px solid ${COLORS.border}`, flexShrink: 0 }}>
        <button
          onClick={() => alert('More attachment options — coming soon.')}
          aria-label="Add attachment"
          style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0, background: COLORS.violetTint, color: COLORS.violet, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={onFileSelected} />

        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder={placeholder}
            style={{ width: '100%', padding: '10px 68px 10px 16px', borderRadius: RADIUS.pill, border: 'none', background: COLORS.surfaceAlt, fontSize: FONT.body.fontSize, outline: 'none', boxSizing: 'border-box' }}
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
            <EmojiPicker onSelect={(emoji) => onTextChange(text + emoji)} />
          )}
        </div>

        <button
          onClick={() => {
            if (text.trim() || stagedImage?.uploadedUrl) onSend();
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

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => onSetLightboxUrl(null)} />}
    </div>
  );
}

const composerInlineBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
};
