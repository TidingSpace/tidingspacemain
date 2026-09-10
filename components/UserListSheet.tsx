'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import { createClient } from '@/lib/supabase-browser';
import { COLORS, RADIUS } from '@/lib/designTokens';

type ListUser = {
  id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null;
  is_verified_organizer?: boolean; isFollowedByViewer: boolean;
};

// Shared between Followers and Following — same layout, different fetch
// URL and title, so no reason to build two near-identical components.
export default function UserListSheet({
  title,
  fetchUrl,
  emptyMessage,
  onClose
}: {
  title: string;
  fetchUrl: string;
  emptyMessage: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((json) => setUsers(json.users ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUrl]);

  async function toggleFollow(u: ListUser) {
    setPendingIds((prev) => new Set(prev).add(u.id));
    const nowFollowing = !u.isFollowedByViewer;
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowedByViewer: nowFollowing } : x))); // optimistic
    try {
      await fetch(`/api/follows/${u.id}`, { method: nowFollowing ? 'POST' : 'DELETE' });
    } catch {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowedByViewer: !nowFollowing } : x))); // roll back on failure
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(u.id); return next; });
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px 20px', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 16px auto', flexShrink: 0 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 14, flexShrink: 0 }}>{title}</div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <p style={{ fontSize: 13, color: COLORS.textFaint, textAlign: 'center', padding: '20px 0' }}>Loading…</p>}
          {!loading && users.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
              <Link href={`/profile/${u.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textDecoration: 'none' }}>
                <Avatar name={u.name} color={u.avatar_color} avatarUrl={u.avatar_url} size="md" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {u.name}
                    {u.is_verified_organizer && <VerifiedBadge size={14} />}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textFaint }}>@{u.handle}</div>
                </div>
              </Link>
              {/* Hidden for your own entry — you can appear in someone else's
                  followers/following list yourself, and can't follow yourself. */}
              {u.id !== myId && (
                <button
                  onClick={() => toggleFollow(u)}
                  disabled={pendingIds.has(u.id)}
                  style={{
                    padding: '7px 16px', borderRadius: RADIUS.pill, fontSize: 12.5, fontWeight: 700, flexShrink: 0,
                    border: u.isFollowedByViewer ? `1px solid ${COLORS.border}` : 'none', cursor: 'pointer',
                    background: u.isFollowedByViewer ? '#fff' : COLORS.violet,
                    color: u.isFollowedByViewer ? COLORS.textSecondary : '#fff'
                  }}
                >
                  {u.isFollowedByViewer ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          ))}
          {!loading && users.length === 0 && (
            <p style={{ fontSize: 13, color: COLORS.textFaint, textAlign: 'center', padding: '20px 0' }}>{emptyMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}
