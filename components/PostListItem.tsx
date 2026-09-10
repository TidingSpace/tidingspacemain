'use client';

import { useState } from 'react';
import Avatar from '@/components/Avatar';
import ActivityPostCard from '@/components/ActivityPostCard';
import PostActionsRow from '@/components/PostActionsRow';
import MediaLightbox from '@/components/MediaLightbox';
import { COLORS, RADIUS, SHADOW, FONT } from '@/lib/designTokens';

export type Post = {
  id: string;
  type: 'text' | 'image' | 'repost';
  text: string | null;
  image_url: string | null;
  image_urls: string[];
  created_at: string;
  like_count: number;
  comment_count: number;
  repost_count: number;
  author: { id: string; name: string; avatar_color: string; avatar_url: string | null; is_verified_organizer?: boolean } | null;
  activity: { id: string; title: string; category: string; cover_image_url: string | null; starts_at: string; address: string | null } | null;
  activity_extras: { spots_remaining: number; attendees: { id: string; name: string; avatar_color: string }[] } | null;
  original: { id: string; text: string; image_url: string | null; image_urls: string[]; author: { id: string; name: string; avatar_color: string; avatar_url: string | null; is_verified_organizer?: boolean } } | null;
  my_repost_id?: string | null;
  liked_by_me?: boolean;
  saved_by_me?: boolean;
};

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// The single canonical way a post renders anywhere in the app — Feed and
// Profile both use this now, instead of Profile having its own simpler
// lookalike. Same icons, same real activity card, same click-through to the
// activity, same menu (Delete for your own posts, Report for anyone else's).
export default function PostListItem({
  post,
  currentUserId,
  liked,
  saved,
  onLike,
  onSave,
  onShare,
  onReport,
  onDelete,
  onRemovedLocally
}: {
  post: Post;
  currentUserId: string | null;
  liked: boolean;
  saved: boolean;
  onLike: (e: React.MouseEvent) => void;
  onSave: (e: React.MouseEvent) => void;
  onShare: (e: React.MouseEvent) => void;
  onReport: () => void;
  onDelete: () => void;
  // Called when un-reposting removes the exact post row currently being
  // viewed (i.e. this card IS your own repost, and you just undid it) — a
  // separate, lighter callback from onDelete, since the actual deletion
  // already happened via the repost toggle's own API call; this one only
  // needs to update what's on screen, not delete anything or ask to confirm.
  onRemovedLocally?: (postId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const isOwnRepostCard = post.type === 'repost' && post.author?.id === currentUserId;
  const [reposted, setReposted] = useState(isOwnRepostCard || !!post.my_repost_id);
  const [myRepostId, setMyRepostId] = useState<string | null>(isOwnRepostCard ? post.id : (post.my_repost_id ?? null));
  const [localRepostCount, setLocalRepostCount] = useState<number | null>(null);

  const displayAuthor = post.type === 'repost' ? post.original?.author : post.author;
  const displayText = post.type === 'repost' ? post.original?.text : post.text;
  const source = post.type === 'repost' ? post.original : post;
  const isRepost = post.type === 'repost';
  const displayImages = (source?.image_urls && source.image_urls.length > 0)
    ? source.image_urls
    : (source?.image_url ? [source.image_url] : []);
  const isOwnPost = !!currentUserId && post.author?.id === currentUserId;

  async function handleRepost(e: React.MouseEvent) {
    e.stopPropagation();
    if (!currentUserId) { window.location.href = '/login'; return; }

    if (reposted) {
      // Un-repost: delete my own repost row. Reuses the existing delete-post
      // endpoint rather than a separate one — a repost is a real post row
      // I own, so the same ownership check and (harmless, since reposts
      // have no images of their own) cleanup logic already apply correctly.
      const idToDelete = myRepostId;
      if (!idToDelete) return;
      setReposted(false);
      setMyRepostId(null);
      setLocalRepostCount(Math.max((localRepostCount ?? post.repost_count) - 1, 0));
      const res = await fetch(`/api/posts/${idToDelete}`, { method: 'DELETE' });
      if (!res.ok) {
        setReposted(true);
        setMyRepostId(idToDelete);
        setLocalRepostCount(null);
      } else if (post.id === idToDelete) {
        // This card IS the repost that was just undone — it no longer
        // exists as a real row, so it shouldn't keep sitting in the feed
        // looking like a normal (or broken) post until the next reload.
        onRemovedLocally?.(post.id);
      }
      return;
    }

    setReposted(true);
    setLocalRepostCount((localRepostCount ?? post.repost_count) + 1);
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'repost', repost_of: post.id })
    });
    const json = await res.json();
    if (!res.ok || !json.post) {
      setReposted(false);
      setLocalRepostCount(null);
    } else {
      setMyRepostId(json.post.id);
    }
  }

  return (
    <div className="ts-fade-in" style={{ padding: '18px 20px', borderTop: `1px solid ${COLORS.border}`, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 12 }} onClick={() => window.location.href = `/feed/${post.id}`}>
        <a
          href={`/profile/${(isRepost ? post.author?.id : displayAuthor?.id) ?? ''}`}
          onClick={(e) => e.stopPropagation()}
          style={{ flexShrink: 0 }}
        >
          <Avatar
            name={(isRepost ? post.author?.name : displayAuthor?.name) || '?'}
            color={isRepost ? post.author?.avatar_color : displayAuthor?.avatar_color}
            avatarUrl={isRepost ? post.author?.avatar_url : displayAuthor?.avatar_url}
            verified={isRepost ? post.author?.is_verified_organizer : displayAuthor?.is_verified_organizer}
            size="md"
          />
        </a>

        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {isRepost && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: COLORS.textFaint, marginBottom: 2 }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                  reposted
                </div>
              )}
              <a
                href={`/profile/${(isRepost ? post.author?.id : displayAuthor?.id) ?? ''}`}
                onClick={(e) => e.stopPropagation()}
                style={{ ...FONT.cardTitle, color: COLORS.ink, textDecoration: 'none' }}
              >
                {isRepost ? post.author?.name : displayAuthor?.name}
              </a>
              <div style={{ fontSize: 12.5, color: COLORS.textFaint, marginTop: 1 }}>{timeAgo(post.created_at)}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textFaint, padding: 4 }}
              aria-label="More"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
          </div>

          {!isRepost && (
            <div style={{ ...FONT.body, margin: '8px 0 0 0', color: COLORS.ink }}>
              {displayText}
            </div>
          )}

          {!isRepost && displayImages.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: displayImages.length === 1 ? '1fr' : 'repeat(2, 1fr)',
              gap: 4, marginTop: 12, borderRadius: RADIUS.md, overflow: 'hidden'
            }}>
              {displayImages.slice(0, 4).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  loading="lazy"
                  onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                  style={{ width: '100%', height: displayImages.length === 1 ? 220 : 140, objectFit: 'cover', cursor: 'pointer' }}
                />
              ))}
            </div>
          )}

          {isRepost && (
            <div style={{ marginTop: 8, padding: 12, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Avatar name={displayAuthor?.name || '?'} color={displayAuthor?.avatar_color} avatarUrl={displayAuthor?.avatar_url} size="sm" />
                <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink }}>{displayAuthor?.name}</div>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: COLORS.ink }}>
                {displayText}
              </div>
              {displayImages.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: displayImages.length === 1 ? '1fr' : 'repeat(2, 1fr)',
                  gap: 4, marginTop: 10, borderRadius: RADIUS.sm, overflow: 'hidden'
                }}>
                  {displayImages.slice(0, 4).map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt=""
                      loading="lazy"
                      onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                      style={{ width: '100%', height: displayImages.length === 1 ? 160 : 100, objectFit: 'cover', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {post.activity && (
            <div onClick={(e) => e.stopPropagation()}>
              <ActivityPostCard activity={post.activity} extras={post.activity_extras} />
            </div>
          )}

          <PostActionsRow
            commentCount={post.comment_count}
            repostCount={localRepostCount ?? post.repost_count}
            likeCount={post.like_count}
            liked={liked}
            saved={saved}
            reposted={reposted}
            onLike={onLike}
            onSave={onSave}
            onShare={onShare}
            onRepost={handleRepost}
          />
        </div>
      </div>

      {menuOpen && (
        <div style={{
          position: 'absolute', top: 54, right: 20, background: '#fff', border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.sm, boxShadow: SHADOW.raised, zIndex: 10, overflow: 'hidden'
        }}>
          {isOwnPost ? (
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'none', color: COLORS.danger, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Delete
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onReport(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'none', color: COLORS.danger, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Report
            </button>
          )}
        </div>
      )}

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
