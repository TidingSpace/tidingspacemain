'use client';

import { useState, useEffect } from 'react';
import Avatar from '@/components/Avatar';
import { COLORS, RADIUS } from '@/lib/designTokens';

type SearchUser = { id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null };

export default function InviteToActivitySheet({
  activityId,
  onClose
}: {
  activityId: string;
  onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [followers, setFollowers] = useState<SearchUser[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(true);
  // Immediate per-person send, not a multi-select-then-batch-confirm flow —
  // matches the exact pattern group chat's "Add People" already uses:
  // tap Invite, it sends right then, button goes grey. Simpler than a
  // separate confirm step, and consistent with how the rest of the app
  // already handles this same kind of picker.
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/users/followers')
      .then((r) => r.json())
      .then((json) => setFollowers(json.users ?? []))
      .catch(() => {})
      .finally(() => setLoadingFollowers(false));
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const json = await res.json();
      setSearchResults(json.users ?? []);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  async function handleInvite(u: SearchUser) {
    if (invitedIds.has(u.id)) return;
    setInvitedIds((prev) => new Set(prev).add(u.id)); // optimistic — goes grey immediately, matching the Add People pattern
    const res = await fetch(`/api/activities/${activityId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id })
    });
    const json = await res.json();
    if (json.error) {
      alert(json.error);
      setInvitedIds((prev) => { const next = new Set(prev); next.delete(u.id); return next; }); // roll back on real failure
    }
  }

  const list = searchQuery.trim() ? searchResults : followers;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px 20px', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 16px auto', flexShrink: 0 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 14, flexShrink: 0 }}>Invite People</div>

        <input
          autoFocus
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or ID…"
          style={{ width: '100%', padding: '11px 16px', borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, background: COLORS.surfaceAlt, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12, flexShrink: 0 }}
        />

        {!searchQuery.trim() && (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6, flexShrink: 0 }}>
            Your Followers
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loadingFollowers && !searchQuery.trim() && (
            <p style={{ fontSize: 13, color: COLORS.textFaint, textAlign: 'center', padding: '20px 0' }}>Loading…</p>
          )}
          {list.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
              <Avatar name={u.name} color={u.avatar_color} avatarUrl={u.avatar_url} size="md" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{u.name}</div>
                <div style={{ fontSize: 12, color: COLORS.textFaint }}>@{u.handle}</div>
              </div>
              <button
                onClick={() => handleInvite(u)}
                disabled={invitedIds.has(u.id)}
                style={{
                  padding: '7px 16px', borderRadius: RADIUS.pill, fontSize: 12.5, fontWeight: 700, flexShrink: 0,
                  border: 'none', cursor: invitedIds.has(u.id) ? 'default' : 'pointer',
                  background: invitedIds.has(u.id) ? COLORS.surfaceAlt : COLORS.violet,
                  color: invitedIds.has(u.id) ? COLORS.textFaint : '#fff'
                }}
              >
                {invitedIds.has(u.id) ? 'Invited' : 'Invite'}
              </button>
            </div>
          ))}
          {searchQuery.trim() && searchResults.length === 0 && (
            <p style={{ fontSize: 13, color: COLORS.textFaint, textAlign: 'center', padding: '20px 0' }}>No one found.</p>
          )}
          {!searchQuery.trim() && !loadingFollowers && followers.length === 0 && (
            <p style={{ fontSize: 13, color: COLORS.textFaint, textAlign: 'center', padding: '20px 0' }}>No followers yet — try searching by name instead.</p>
          )}
        </div>
      </div>
    </div>
  );
}
