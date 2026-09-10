'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import ErrorState from '@/components/ErrorState';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import Avatar from '@/components/Avatar';
import MediaLightbox from '@/components/MediaLightbox';
import PostActionsRow from '@/components/PostActionsRow';
import { COLORS, RADIUS } from '@/lib/designTokens';

type Post = {
  id: string;
  type: 'text' | 'image' | 'repost';
  text: string | null;
  image_url: string | null;
  image_urls: string[];
  created_at: string;
  like_count: number;
  comment_count: number;
  repost_count: number;
  author: { id: string; name: string; avatar_color: string; avatar_url: string | null } | null;
  activity: { id: string; title: string; category: string } | null;
  original: { id: string; text: string; image_url: string | null; image_urls: string[]; author: { id: string; name: string; avatar_color: string; avatar_url: string | null } } | null;
};

type Comment = {
  id: string;
  text: string;
  created_at: string;
  author: { id: string; name: string; avatar_color: string; avatar_url: string | null; is_verified_organizer?: boolean } | null;
};

export default function PostDetailPage({ params }: { params: { postId: string } }) {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [myRepostId, setMyRepostId] = useState<string | null>(null);
  const [localRepostCount, setLocalRepostCount] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      const [postRes, commentsRes] = await Promise.all([
        fetch(`/api/posts/${params.postId}`).then((r) => r.json()),
        fetch(`/api/posts/${params.postId}/comments`).then((r) => r.json())
      ]);
      setPost(postRes.post ?? null);
      setComments(commentsRes.comments || []);
      if (postRes.post?.my_repost_id) {
        setReposted(true);
        setMyRepostId(postRes.post.my_repost_id);
      }
      setLiked(!!postRes.post?.liked_by_me);
      setSaved(!!postRes.post?.saved_by_me);
    } catch {
      setError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.postId]);

  async function toggleLike() {
    if (!user) { window.location.href = '/login'; return; }
    if (!post) return;
    const next = !liked;
    setLiked(next);
    setPost({ ...post, like_count: post.like_count + (next ? 1 : -1) });
    await fetch(`/api/posts/${post.id}/like`, { method: next ? 'POST' : 'DELETE' });
  }

  async function toggleSave() {
    if (!user) { window.location.href = '/login'; return; }
    if (!post) return;
    const next = !saved;
    setSaved(next);
    await fetch(`/api/saved/posts/${post.id}`, { method: next ? 'POST' : 'DELETE' });
  }

  async function handleRepost() {
    if (!post) return;
    if (!user) { window.location.href = '/login'; return; }

    if (reposted) {
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
        // The post being viewed IS the repost that was just undone — it no
        // longer exists, so there's nothing left to show on this page.
        window.location.href = '/feed';
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

  function handleShare() {
    if (!post) return;
    const url = `${window.location.origin}/feed/${post.id}`;
    navigator.clipboard?.writeText(url);
    alert('Link copied.');
  }

  async function submitComment() {
    if (!user) { window.location.href = '/login'; return; }
    if (!commentText.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/posts/${params.postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: commentText.trim() })
    });
    const json = await res.json();
    setSubmitting(false);
    if (json.error) {
      alert(json.error);
      return;
    }
    setCommentText('');
    load();
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message="Couldn't load this post." onRetry={load} />;
  if (!post) return <div style={{ padding: 40, color: COLORS.textSecondary }}>Post not found.</div>;

  const displayAuthor = post.type === 'repost' ? post.original?.author : post.author;
  const displayText = post.type === 'repost' ? post.original?.text : post.text;
  const displaySource = post.type === 'repost' ? post.original : post;
  const displayImages = (displaySource?.image_urls && displaySource.image_urls.length > 0)
    ? displaySource.image_urls
    : (displaySource?.image_url ? [displaySource.image_url] : []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      <PageHeader title="Post" backHref="/feed" large={false} />

      {/* The post itself */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
        {post.type === 'repost' && (
          <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 8 }}>🔁 {post.author?.name} reposted</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <Link href={`/profile/${displayAuthor?.id}`} style={{ textDecoration: 'none' }}>
            <Avatar name={displayAuthor?.name || '?'} color={displayAuthor?.avatar_color} avatarUrl={displayAuthor?.avatar_url} size="md" />
          </Link>
          <div>
            <Link href={`/profile/${displayAuthor?.id}`} style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.ink, textDecoration: 'none' }}>
              {displayAuthor?.name}
            </Link>
            <div style={{ fontSize: 12, color: COLORS.textFaint }}>{new Date(post.created_at).toLocaleString()}</div>
          </div>
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.6, marginBottom: 14 }}>{displayText}</div>

        {displayImages.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: displayImages.length === 1 ? '1fr' : 'repeat(2, 1fr)',
            gap: 4, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: 14
          }}>
            {displayImages.slice(0, 4).map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                loading="lazy"
                onClick={() => setLightboxUrl(url)}
                style={{ width: '100%', height: displayImages.length === 1 ? 260 : 160, objectFit: 'cover', cursor: 'pointer' }}
              />
            ))}
          </div>
        )}

        {post.activity && (
          <Link href="/" style={{ display: 'inline-block', fontSize: 12.5, background: COLORS.violetTint, color: COLORS.violetDeep, padding: '5px 12px', borderRadius: RADIUS.pill, marginBottom: 14, textDecoration: 'none' }}>
            📍 {post.activity.title}
          </Link>
        )}

        <PostActionsRow
          commentCount={comments.length}
          repostCount={localRepostCount ?? post.repost_count}
          likeCount={post.like_count}
          liked={liked}
          saved={saved}
          reposted={reposted}
          onLike={toggleLike}
          onSave={toggleSave}
          onShare={handleShare}
          onRepost={handleRepost}
        />
      </div>

      {/* Comment composer */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitComment()}
          placeholder="Write a comment…"
          style={{ flex: 1, padding: 10, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 14 }}
        />
        <button
          onClick={submitComment}
          disabled={submitting}
          style={{ padding: '0 16px', borderRadius: RADIUS.sm, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 600, cursor: 'pointer' }}
        >
          Reply
        </button>
      </div>

      {/* Comments list */}
      <div>
        {comments.length === 0 && <EmptyState message="No comments yet — be the first to reply." />}
        {comments.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 10, padding: '12px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
            <Link href={`/profile/${c.author?.id}`} style={{ textDecoration: 'none' }}>
              <Avatar name={c.author?.name || '?'} color={c.author?.avatar_color} avatarUrl={c.author?.avatar_url} size="sm" verified={c.author?.is_verified_organizer} />
            </Link>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {c.author?.name}
                <span style={{ fontWeight: 400, color: COLORS.textFaint, marginLeft: 6, fontSize: 11.5 }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>{c.text}</div>
            </div>
          </div>
        ))}
      </div>

      {lightboxUrl && <MediaLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
