'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { useBottomNavVisibility } from '@/lib/bottomNavVisibility';
import UserListSheet from '@/components/UserListSheet';
import AttendedActivitiesSheet from '@/components/AttendedActivitiesSheet';
import ErrorState from '@/components/ErrorState';
import { useImageUpload } from '@/hooks/useImageUpload';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import CategoryIcon from '@/components/CategoryIcon';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import PostListItem, { type Post } from '@/components/PostListItem';
import { COLORS, RADIUS, SHADOW, FONT } from '@/lib/designTokens';

type Profile = {
  id: string; name: string; handle: string; bio: string | null;
  avatar_color: string; avatar_url: string | null; verification_tier: string; created_at: string;
  is_verified_organizer: boolean;
};
type Activity = { id: string; title: string; category: string; starts_at: string; price_cents: number; spots_remaining: number };
type Interest = { key: string; label: string; icon: string };

export default function ProfilePage({ params }: { params: { userId: string } }) {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [organizing, setOrganizing] = useState<Activity[]>([]);
  const [attendedActivities, setAttendedActivities] = useState<{ id: string; title: string; category: string; starts_at: string; status: string }[]>([]);
  const [openListSheet, setOpenListSheet] = useState<'activities' | 'followers' | 'following' | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const { setHidden: setBottomNavHidden } = useBottomNavVisibility();
  useEffect(() => {
    setBottomNavHidden(!isOwnProfile);
    return () => setBottomNavHidden(false);
  }, [isOwnProfile, setBottomNavHidden]);
  const [editing, setEditing] = useState(false);
  const avatarUpload = useImageUpload('avatars');
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editingInterests, setEditingInterests] = useState(false);
  const [allCategories, setAllCategories] = useState<Interest[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [savingInterests, setSavingInterests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  async function load() {
    setLoadError(false);
    try {
      const [res, attendedRes] = await Promise.all([
        fetch(`/api/profiles/${params.userId}`),
        fetch(`/api/profiles/${params.userId}/attended-activities`)
      ]);
      const json = await res.json();
      const attendedJson = await attendedRes.json();
      if (json.error) { setLoading(false); return; }
      setProfile(json.profile);
      setPosts(json.posts);
      setLikedIds(new Set((json.posts ?? []).filter((p: Post) => p.liked_by_me).map((p: Post) => p.id)));
      setSavedIds(new Set((json.posts ?? []).filter((p: Post) => p.saved_by_me).map((p: Post) => p.id)));
      setOrganizing(json.organizing);
      setAttendedActivities(attendedJson.activities ?? []);
      setFollowerCount(json.followerCount);
      setFollowingCount(json.followingCount);
      setInterests(json.interests || []);
      setIsFollowing(json.isFollowing);
      setIsBlocked(json.isBlockedByViewer);
      setIsOwnProfile(json.isOwnProfile);
      setEditName(json.profile.name);
      setEditBio(json.profile.bio ?? '');
      setEditHandle(json.profile.handle ?? '');
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return; }
      setViewerId(data.user.id);
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.userId]);

  async function toggleBlock() {
    setMenuOpen(false);
    if (isBlocked) {
      await fetch(`/api/blocks/${params.userId}`, { method: 'DELETE' });
      setIsBlocked(false);
    } else {
      if (!confirm(`Block ${profile?.name ?? 'this person'}? You won't see each other's activities, posts, or messages, and any existing follow between you will be removed.`)) return;
      const res = await fetch(`/api/blocks/${params.userId}`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { alert(json.error); return; }
      setIsBlocked(true);
      setIsFollowing(false); // blocking always removes any existing follow, both directions
    }
  }

  async function handleReportUser() {
    setMenuOpen(false);
    // Same lightweight prompt() pattern already used for reporting a post
    // on this same page (handleReportPost below) — kept consistent rather
    // than introducing a different reporting UI just for this one action.
    const reason = prompt(`Why are you reporting ${profile?.name ?? 'this person'}? (e.g., Spam, Harassment, Impersonation)`);
    if (!reason) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_user_id: params.userId, reason })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    alert('Thanks — this has been reported for review.');
  }

  async function toggleFollow() {
    if (isFollowing) {
      await fetch(`/api/follows/${params.userId}`, { method: 'DELETE' });
      setIsFollowing(false);
      setFollowerCount((c) => c - 1);
    } else {
      await fetch(`/api/follows/${params.userId}`, { method: 'POST' });
      setIsFollowing(true);
      setFollowerCount((c) => c + 1);
    }
  }

  async function saveEdit() {
    setEditError(null);
    const res = await fetch(`/api/profiles/${params.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, bio: editBio, handle: editHandle })
    });
    const json = await res.json();
    if (json.profile) {
      setProfile(json.profile);
      setEditHandle(json.profile.handle ?? '');
      setEditing(false);
    } else if (json.error) {
      setEditError(json.error);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !profile) return;

    const path = `${profile.id}/avatar-${Date.now()}.jpg`;
    // Avatars are small everywhere they're shown (biggest is the 100px profile
    // header) — 800px is plenty and keeps the file genuinely small.
    const url = await avatarUpload.replace(file, path, profile.avatar_url, 800);
    if (!url) return; // avatarUpload.error is already set for the UI to show

    const res = await fetch(`/api/profiles/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_url: url })
    });
    const json = await res.json();
    if (json.profile) setProfile(json.profile);
  }

  async function toggleLike(post: Post, e: React.MouseEvent) {
    e.stopPropagation();
    if (!viewerId) { window.location.href = '/login'; return; }
    const liked = likedIds.has(post.id);
    const next = new Set(likedIds);
    liked ? next.delete(post.id) : next.add(post.id);
    setLikedIds(next);
    const res = await fetch(`/api/posts/${post.id}/like`, { method: liked ? 'DELETE' : 'POST' });
    if (!res.ok) setLikedIds(likedIds);
  }

  async function toggleSave(post: Post, e: React.MouseEvent) {
    e.stopPropagation();
    if (!viewerId) { window.location.href = '/login'; return; }
    const saved = savedIds.has(post.id);
    const next = new Set(savedIds);
    saved ? next.delete(post.id) : next.add(post.id);
    setSavedIds(next);
    await fetch(`/api/saved/posts/${post.id}`, { method: saved ? 'DELETE' : 'POST' });
  }

  function handleShare(post: Post, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard?.writeText(`${window.location.origin}/feed/${post.id}`);
    alert('Link copied.');
  }

  async function handleReportPost(post: Post) {
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

  async function handleDeletePost(post: Post) {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.error) {
      alert(`Couldn't delete: ${json.error}`);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  }

  async function openInterestEditor() {
    if (allCategories.length === 0) {
      const res = await fetch('/api/categories');
      const json = await res.json();
      setAllCategories(json.categories || []);
    }
    setSelectedKeys(new Set(interests.map((i) => i.key)));
    setEditingInterests(true);
  }

  function toggleKey(key: string) {
    const next = new Set(selectedKeys);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedKeys(next);
  }

  async function saveInterests() {
    setSavingInterests(true);
    const res = await fetch('/api/interests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_keys: Array.from(selectedKeys) })
    });
    setSavingInterests(false);
    if (res.ok) {
      setEditingInterests(false);
      load();
    }
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message="Couldn't load this profile." onRetry={load} />;
  if (!profile) return <div style={{ padding: 40, color: COLORS.textSecondary }}>Profile not found.</div>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 90, background: '#fff', minHeight: '100vh' }}>

      {/* Header — title + bell + gear on your own profile; back-nav on someone else's */}
      {isOwnProfile ? (
        <PageHeader
          title="Profile"
          right={
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/notifications" style={circleBtnStyle} aria-label="Notifications">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </Link>
              <Link href="/settings" style={circleBtnStyle} aria-label="Settings">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </Link>
            </div>
          }
        />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 12px 20px', position: 'relative' }}>
          <Link href="/" style={circleBtnStyle}>✕</Link>
          <button onClick={() => setMenuOpen((v) => !v)} style={circleBtnStyle} aria-label="More">
            <svg viewBox="0 0 24 24" width="18" height="18" fill={COLORS.ink}><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 54, right: 20, background: '#fff', border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm, boxShadow: SHADOW.raised, zIndex: 10, overflow: 'hidden'
            }}>
              <button
                onClick={toggleBlock}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'none', color: COLORS.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {isBlocked ? 'Unblock' : 'Block'}
              </button>
              {!isBlocked && (
                <button
                  onClick={handleReportUser}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', border: 'none', background: 'none', color: COLORS.danger, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Report
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Identity block — no banner, matches the mockup */}
      <div style={{ padding: '4px 20px 0 20px', display: 'flex', gap: 16 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={profile.name} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="xl" />
          {avatarUpload.uploading && (
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(28,24,48,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700
            }}>
              {Math.round(avatarUpload.progress * 100)}%
            </div>
          )}
          {isOwnProfile && (
            <button
              onClick={() => avatarInputRef.current?.click()}
              style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: '50%', background: '#fff', border: `1px solid ${COLORS.border}`, boxShadow: SHADOW.card, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="Change photo"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
          )}
          <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
        </div>

        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
          {editing ? (
            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...FONT.sectionTitle, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }} />
          ) : (
            <h2 style={{ ...FONT.sectionTitle, margin: 0, color: COLORS.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
              {profile.name}
              {profile.is_verified_organizer && <VerifiedBadge size={20} />}
            </h2>
          )}
          {editing ? (
            <div style={{ margin: '2px 0 8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 13.5, color: COLORS.textFaint }}>@</span>
                <input
                  value={editHandle}
                  onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  maxLength={20}
                  style={{ fontSize: 13.5, color: COLORS.ink, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '3px 6px', width: 160 }}
                />
              </div>
              {editError && <p style={{ fontSize: 12, color: COLORS.danger, margin: '4px 0 0 0' }}>{editError}</p>}
            </div>
          ) : (
            <p style={{ fontSize: 13.5, color: COLORS.textFaint, margin: '2px 0 8px 0' }}>@{profile.handle}</p>
          )}

          {editing ? (
            <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={2}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          ) : (
            profile.bio && <p style={{ fontSize: 14.5, color: COLORS.ink, margin: 0, lineHeight: 1.5 }}>{profile.bio}</p>
          )}

          {isOwnProfile ? (
            editing ? (
              <button onClick={saveEdit} style={editBtnStyle(true)}>Save</button>
            ) : (
              <button onClick={() => setEditing(true)} style={editBtnStyle(false)}>Edit Profile</button>
            )
          ) : (
            <button onClick={toggleFollow} style={editBtnStyle(isFollowing)}>{isFollowing ? 'Following' : 'Follow'}</button>
          )}
          {avatarUpload.error && (
            <p style={{ color: COLORS.danger, fontSize: 12, marginTop: 8 }}>{avatarUpload.error}</p>
          )}
        </div>
      </div>

      {/* Stats row — plain, no card background, matches the mockup */}
      <div style={{ display: 'flex', padding: '22px 20px', textAlign: 'center' }}>
        <Stat label="Activities" value={attendedActivities.length} onClick={() => setOpenListSheet('activities')} />
        <Stat label="Followers" value={followerCount} onClick={() => setOpenListSheet('followers')} />
        <Stat label="Following" value={followingCount} onClick={() => setOpenListSheet('following')} />
      </div>

      {/* My Interests — user-selected, reusing the real categories table */}
      <div style={{ margin: '0 20px 20px 20px', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 16, color: COLORS.ink }}>My Interests</b>
          {isOwnProfile && (
            <button onClick={openInterestEditor} style={{ background: 'none', border: 'none', color: COLORS.violet, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {interests.map((i) => (
            <div key={i.key} style={interestChipStyle}>
              <CategoryIcon src={i.icon} size={15} /> {i.label}
            </div>
          ))}
          {interests.length === 0 && !isOwnProfile && (
            <span style={{ fontSize: 13, color: COLORS.textFaint }}>No interests added yet.</span>
          )}
          {isOwnProfile && (
            <button onClick={openInterestEditor} style={{ ...interestChipStyle, cursor: 'pointer', border: `1px dashed ${COLORS.border}`, background: 'none' }}>
              + Add more
            </button>
          )}
        </div>
      </div>

      {/* Posts */}
      <div style={{ padding: '0 20px', marginBottom: 8 }}>
        <b style={{ fontSize: 16, color: COLORS.ink }}>Posts</b>
      </div>
      {posts.length === 0 ? (
        <EmptyState message="No posts yet." />
      ) : (
        <div>
          {posts.map((p) => (
            <PostListItem
              key={p.id}
              post={p}
              currentUserId={viewerId}
              liked={likedIds.has(p.id)}
              saved={savedIds.has(p.id)}
              onLike={(e) => toggleLike(p, e)}
              onSave={(e) => toggleSave(p, e)}
              onShare={(e) => handleShare(p, e)}
              onReport={() => handleReportPost(p)}
              onDelete={() => handleDeletePost(p)}
              onRemovedLocally={(postId) => setPosts((prev) => prev.filter((x) => x.id !== postId))}
            />
          ))}
        </div>
      )}

      {/* Interest editor sheet */}
      {editingInterests && (
        <div onClick={() => setEditingInterests(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 28px 20px', maxHeight: '75%', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 18px auto' }} />
            <b style={{ fontSize: 16, display: 'block', marginBottom: 14 }}>Select your interests</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {allCategories.map((c) => {
                const active = selectedKeys.has(c.key);
                return (
                  <button
                    key={c.key}
                    onClick={() => toggleKey(c.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: RADIUS.pill,
                      border: active ? `1px solid ${COLORS.violet}` : `1px solid ${COLORS.border}`,
                      background: active ? COLORS.violetTint : '#fff',
                      color: active ? COLORS.violetDeep : COLORS.textSecondary,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    <CategoryIcon src={c.icon} size={15} /> {c.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={saveInterests}
              disabled={savingInterests}
              style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              {savingInterests ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {openListSheet === 'activities' && (
        <AttendedActivitiesSheet activities={attendedActivities} onClose={() => setOpenListSheet(null)} />
      )}
      {openListSheet === 'followers' && (
        <UserListSheet
          title="Followers"
          fetchUrl={`/api/profiles/${params.userId}/followers`}
          emptyMessage="No followers yet."
          onClose={() => setOpenListSheet(null)}
        />
      )}
      {openListSheet === 'following' && (
        <UserListSheet
          title="Following"
          fetchUrl={`/api/profiles/${params.userId}/following`}
          emptyMessage="Not following anyone yet."
          onClose={() => setOpenListSheet(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{ flex: 1, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ fontWeight: 700, fontSize: 21, color: COLORS.ink }}>{value}</div>
      <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 }}>{label}</div>
    </div>
  );
}

const circleBtnStyle: React.CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', background: '#fff', border: `1px solid ${COLORS.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textDecoration: 'none', color: COLORS.ink
};
const interestChipStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: RADIUS.pill,
  border: `1px solid ${COLORS.border}`, background: '#fff', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary
};
function editBtnStyle(active: boolean): React.CSSProperties {
  return {
    marginTop: 10, padding: '8px 16px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: active ? `1px solid ${COLORS.border}` : 'none',
    background: active ? COLORS.violetTint : COLORS.violet,
    color: active ? COLORS.violetDeep : '#fff'
  };
}
