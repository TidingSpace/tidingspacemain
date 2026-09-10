'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import StatusBadge from '@/components/admin/StatusBadge';
import AdminNotes from '@/components/admin/AdminNotes';
import ConfirmationDialog from '@/components/admin/ConfirmationDialog';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import Avatar from '@/components/Avatar';
import { COLORS, RADIUS } from '@/lib/designTokens';
import { isOnline } from '@/lib/presence';

type UserDetail = {
  id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null;
  email: string | null; created_at: string; account_status: string; last_seen_at: string | null;
  followerCount: number; followingCount: number; activitiesCount: number; groupsCount: number; postsCount: number; activitiesJoinedCount: number;
  reportsSubmitted: number; reportsReceived: number; is_verified_organizer: boolean;
  suspensionHistory: { id: string; action: string; created_at: string; admin: { name: string } | null }[];
};

export default function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'suspended' | 'banned' | 'active' | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/admin/users/${params.id}`).then((r) => r.json()).then((json) => {
      if (json.error) setError(json.error);
      else setUser(json.user);
    });
  }

  useEffect(() => { load(); }, [params.id]);

  async function applyStatus(status: 'suspended' | 'banned' | 'active') {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_status: status })
    });
    setSaving(false);
    setConfirming(null);
    if (!res.ok) { alert("Couldn't update this account — please try again."); return; }
    setUser((prev) => (prev ? { ...prev, account_status: status } : prev));
  }

  async function toggleVerified(next: boolean) {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_verified_organizer: next })
    });
    setSaving(false);
    if (!res.ok) { alert("Couldn't update verification — please try again."); return; }
    setUser((prev) => (prev ? { ...prev, is_verified_organizer: next } : prev));
  }

  if (error) return <div style={{ padding: 28 }}><ErrorState message={error} /></div>;
  if (!user) return <LoadingState />;

  const confirmCopy = {
    suspended: { title: 'Suspend this account?', message: `${user.name} will be blocked from creating activities, posts, and comments until reinstated. This can be undone at any time.`, confirmLabel: 'Suspend' },
    banned: { title: 'Ban this account?', message: `${user.name} will be permanently blocked from creating activities, posts, and comments. This is a stronger action than suspension — use it for serious or repeated violations.`, confirmLabel: 'Ban' },
    active: { title: 'Reinstate this account?', message: `${user.name} will regain full access immediately.`, confirmLabel: 'Reinstate', danger: false }
  };

  return (
    <>
      <AdminHeader title={user.name} subtitle={`@${user.handle}`} actions={<StatusBadge status={user.account_status} />} />
      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
        <AdminCard>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10 }}>
            <Avatar name={user.name} color={user.avatar_color} avatarUrl={user.avatar_url} size="xl" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                {user.name}
                {user.is_verified_organizer && (
                  <span title="Verified organizer" style={{ fontSize: 11, fontWeight: 700, color: COLORS.violet, background: COLORS.violetTint, borderRadius: RADIUS.pill, padding: '2px 7px' }}>✓ Verified</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: COLORS.textFaint }}>@{user.handle}</div>
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{user.email ?? 'Email unavailable'}</div>
            <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
              Joined {new Date(user.created_at).toLocaleDateString()} · {isOnline(user.last_seen_at) ? 'Online now' : user.last_seen_at ? `Last active ${new Date(user.last_seen_at).toLocaleString()}` : 'Never active'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 14 }}>
              <a href={`/profile/${user.id}`} target="_blank" rel="noreferrer" style={actionBtnStyle(false)}>View Profile</a>
              {user.account_status !== 'suspended' && <button onClick={() => setConfirming('suspended')} style={actionBtnStyle(true)}>Suspend</button>}
              {user.account_status === 'suspended' && <button onClick={() => setConfirming('active')} style={actionBtnStyle(false)}>Unsuspend</button>}
              {user.account_status !== 'banned' && <button onClick={() => setConfirming('banned')} style={actionBtnStyle(true)}>Ban</button>}
              {user.account_status === 'banned' && <button onClick={() => setConfirming('active')} style={actionBtnStyle(false)}>Unban</button>}
              {/* Future-ready stubs — no verified-badge or avatar-moderation concept exists in the schema yet. */}
              {!user.is_verified_organizer ? (
                <button onClick={() => toggleVerified(true)} disabled={saving} style={actionBtnStyle(false)}>Verify Organizer</button>
              ) : (
                <button onClick={() => toggleVerified(false)} disabled={saving} style={actionBtnStyle(false)}>Remove Verification</button>
              )}
              <button onClick={() => alert("Resetting a user's avatar is planned but not wired up yet — would need to clear avatar_url and remove the file from Storage.")} style={actionBtnStyle(false)}>Reset Avatar</button>
              <a href={`/admin/reports?user=${user.id}`} style={actionBtnStyle(false)}>View Reports</a>
            </div>
          </div>
        </AdminCard>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          <Stat label="Followers" value={user.followerCount} />
          <Stat label="Following" value={user.followingCount} />
          <Stat label="Activities Created" value={user.activitiesCount} />
          <Stat label="Activities Joined" value={user.activitiesJoinedCount} />
          <Stat label="Groups Joined" value={user.groupsCount} />
          <Stat label="Posts" value={user.postsCount} />
          <Stat label="Reports Submitted" value={user.reportsSubmitted} />
          <Stat label="Reports Received" value={user.reportsReceived} />
        </div>

        {user.suspensionHistory.length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <AdminCard title="Suspension History">
              {user.suspensionHistory.map((h) => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${COLORS.borderLight}`, fontSize: 13.5 }}>
                  <span>{h.action} <span style={{ color: COLORS.textFaint }}>by {h.admin?.name ?? 'unknown'}</span></span>
                  <span style={{ color: COLORS.textFaint, fontSize: 12 }}>{new Date(h.created_at).toLocaleString()}</span>
                </div>
              ))}
            </AdminCard>
          </div>
        )}

        <div style={{ gridColumn: '1 / -1' }}>
          <AdminNotes targetType="user" targetId={user.id} />
        </div>
      </div>

      <ConfirmationDialog
        open={confirming !== null}
        title={confirming ? confirmCopy[confirming].title : ''}
        message={confirming ? confirmCopy[confirming].message : ''}
        confirmLabel={confirming ? confirmCopy[confirming].confirmLabel : ''}
        danger={confirming ? (confirmCopy[confirming] as any).danger ?? true : true}
        loading={saving}
        onConfirm={() => confirming && applyStatus(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: 16 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.ink }}>{value}</div>
      <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function actionBtnStyle(danger: boolean): React.CSSProperties {
  return {
    display: 'block', textAlign: 'center', padding: '9px 0', borderRadius: RADIUS.sm,
    border: `1px solid ${danger ? COLORS.danger : COLORS.border}`, background: '#fff',
    color: danger ? COLORS.danger : COLORS.ink, fontWeight: 600, fontSize: 13, cursor: 'pointer', textDecoration: 'none'
  };
}
