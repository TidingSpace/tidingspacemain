'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import ErrorState from '@/components/ErrorState';
import Avatar from '@/components/Avatar';
import TopBarActions from '@/components/TopBarActions';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import PostListItem, { type Post } from '@/components/PostListItem';
import UnderlineTab from '@/components/UnderlineTab';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

type Tab = 'for-you' | 'following' | 'nearby';

export default function FeedPage() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('for-you');
  const [posts, setPosts] = useState<Post[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [composeText, setComposeText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState(false);
  const [myAvatar, setMyAvatar] = useState<{ avatar_color?: string; avatar_url?: string | null }>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      // The auth user object has no avatar info at all (that lives on
      // profiles, not auth.users) — without this, the composer's avatar can
      // only ever show initials, never a real uploaded photo.
      if (data.user) {
        fetch(`/api/profiles/${data.user.id}`)
          .then((r) => r.json())
          .then((json) => { if (json.profile) setMyAvatar({ avatar_color: json.profile.avatar_color, avatar_url: json.profile.avatar_url }); })
          .catch(() => {});
      }
    });
  }, [supabase]);

  // Sets posts AND derives likedIds/savedIds from what the server actually
  // says about the viewer's own likes/saves — this is what makes the
  // like/save buttons reflect reality on load instead of always starting
  // "off" until you interact with them this session.
  function applyPosts(newPosts: Post[]) {
    setPosts(newPosts);
    setLikedIds(new Set(newPosts.filter((p) => p.liked_by_me).map((p) => p.id)));
    setSavedIds(new Set(newPosts.filter((p) => p.saved_by_me).map((p) => p.id)));
  }

  const loadPosts = useCallback(async (activeTab: Tab) => {
    setLoadingPosts(true);
    setNearbyError(null);
    setPostsError(false);

    if (activeTab === 'nearby') {
      if (!navigator.geolocation) {
        setNearbyError("Your browser doesn't support location — can't show Nearby.");
        setLoadingPosts(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const res = await fetch(`/api/posts?tab=nearby&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
            const json = await res.json();
            if (json.posts) applyPosts(json.posts);
            else if (json.error) setNearbyError(json.error);
            else setPostsError(true);
          } catch {
            setPostsError(true);
          }
          setLoadingPosts(false);
        },
        () => {
          setNearbyError('Location permission denied — enable it to see Nearby posts.');
          setLoadingPosts(false);
        },
        // Previously missing entirely, which left this on the browser's
        // default (enableHighAccuracy: false) — on a desktop/laptop with no
        // GPS chip, that default commonly falls back to IP-address-based
        // geolocation, which is only ever accurate to roughly city level,
        // never a specific neighborhood. Requesting high accuracy tells the
        // browser to use the best method actually available on that device
        // (GPS, or WiFi-based positioning) instead of settling for the
        // coarsest one by default.
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      return;
    }

    try {
      const res = await fetch(`/api/posts?tab=${activeTab}`);
      const json = await res.json();
      if (json.posts) applyPosts(json.posts);
      else setPostsError(true);
    } catch {
      setPostsError(true);
    }
    setLoadingPosts(false);
  }, []);

  useEffect(() => { loadPosts(tab); }, [tab, loadPosts]);

  async function handlePost() {
    if (!user) { window.location.href = '/login'; return; }
    if (!composeText.trim()) return;
    setPosting(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', text: composeText.trim() })
      });
      let json;
      try { json = await res.json(); } catch {
        alert(`The server returned an unexpected response (status ${res.status}). Check your terminal running "npm run dev".`);
        return;
      }
      if (!res.ok || json.error) {
        alert(`Couldn't post: ${json.error || `Server error (status ${res.status})`}`);
        return;
      }
      setComposeText('');
      loadPosts(tab);
    } catch (err: any) {
      alert(`Network error — couldn't reach the server: ${err.message}`);
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(post: Post, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) { window.location.href = '/login'; return; }
    const liked = likedIds.has(post.id);
    const next = new Set(likedIds);
    liked ? next.delete(post.id) : next.add(post.id);
    setLikedIds(next);
    const res = await fetch(`/api/posts/${post.id}/like`, { method: liked ? 'DELETE' : 'POST' });
    if (!res.ok) { setLikedIds(likedIds); return; }
    loadPosts(tab);
  }

  async function toggleSave(post: Post, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user) { window.location.href = '/login'; return; }
    const saved = savedIds.has(post.id);
    const next = new Set(savedIds);
    saved ? next.delete(post.id) : next.add(post.id);
    setSavedIds(next);
    await fetch(`/api/saved/posts/${post.id}`, { method: saved ? 'DELETE' : 'POST' });
  }

  function handleShare(post: Post, e: React.MouseEvent) {
    e.stopPropagation();
    const url = `${window.location.origin}/feed/${post.id}`;
    navigator.clipboard?.writeText(url);
    alert('Link copied.');
  }

  async function handleReport(post: Post) {
    const reason = prompt('Why are you reporting this post? (e.g., Spam, Harassment, Inappropriate)');
    if (!reason) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_post_id: post.id, reason })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    alert('Thanks — this has been reported for review.');
  }

  async function handleDelete(post: Post) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) {
      alert(`Couldn't delete: ${json.error}`);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  }

  const initials = user?.user_metadata?.name
    ? user.user_metadata.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')
    : (user?.email?.[0]?.toUpperCase() ?? '?');

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 90, background: '#fff', minHeight: '100vh' }}>

      {/* Header */}
      <PageHeader title="Feed" right={<TopBarActions avatarInitials={initials} />} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 28, padding: '0 20px 16px 20px' }}>
        <UnderlineTab label="For you" active={tab === 'for-you'} onClick={() => setTab('for-you')} />
        <UnderlineTab label="Following" active={tab === 'following'} onClick={() => setTab('following')} />
        <UnderlineTab label="Nearby" active={tab === 'nearby'} onClick={() => setTab('nearby')} />
        <UnderlineTab label="Friends" active={false} disabled onClick={() => alert('Friends — coming soon. This needs a dedicated friendship system, separate from following.')} />
      </div>

      {/* Composer — a real card, not plain text on the page */}
      <div style={{ margin: '0 20px 20px 20px' }}>
        <div style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Avatar name={user?.user_metadata?.name || 'You'} color={myAvatar.avatar_color} avatarUrl={myAvatar.avatar_url} size="md" />
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder="What's on your mind?"
              rows={1}
              style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: 15, fontFamily: 'inherit', color: COLORS.ink, background: 'transparent', paddingTop: 11 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingLeft: 56 }}>
            <div style={{ display: 'flex', gap: 18 }}>
              <button onClick={() => router.push('/create-post')} style={iconBtnStyle} aria-label="Add photo">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              </button>
              <button onClick={() => alert('Post locations — coming soon.')} style={iconBtnStyle} aria-label="Add location">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </button>
            </div>
            {composeText.trim() && (
              <button
                onClick={handlePost}
                disabled={posting}
                style={{ padding: '8px 18px', borderRadius: RADIUS.pill, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Post list */}
      {loadingPosts && <LoadingState />}
      {nearbyError && <div style={{ textAlign: 'center', color: COLORS.textSecondary, padding: 30, fontSize: 13.5 }}>{nearbyError}</div>}
      {postsError && <ErrorState message="Couldn't load your feed." onRetry={() => loadPosts(tab)} />}

      {!loadingPosts && !nearbyError && !postsError && posts.map((p) => (
        <PostListItem
          key={p.id}
          post={p}
          currentUserId={user?.id ?? null}
          liked={likedIds.has(p.id)}
          saved={savedIds.has(p.id)}
          onLike={(e) => toggleLike(p, e)}
          onSave={(e) => toggleSave(p, e)}
          onShare={(e) => handleShare(p, e)}
          onReport={() => handleReport(p)}
          onDelete={() => handleDelete(p)}
          onRemovedLocally={(postId) => setPosts((prev) => prev.filter((x) => x.id !== postId))}
        />
      ))}

      {!loadingPosts && !nearbyError && !postsError && posts.length === 0 && (
        <EmptyState message={tab === 'following' ? 'Posts from people you follow will show up here.' : 'No posts yet — be the first to say something.'} />
      )}

    </div>
  );
}



const iconBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' };
