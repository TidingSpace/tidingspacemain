'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import StatusBadge from '@/components/admin/StatusBadge';
import ConfirmationDialog from '@/components/admin/ConfirmationDialog';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import AdminNotes from '@/components/admin/AdminNotes';
import { COLORS, RADIUS } from '@/lib/designTokens';
import { getActivityTimeState } from '@/lib/activityTimeState';

type Activity = {
  id: string; title: string; category: string; status: string; created_at: string; starts_at: string; ends_at: string | null;
  is_recurring: boolean; capacity: number; organizer: { id: string; name: string; handle: string } | null;
  featured: boolean; featured_until: string | null; featured_reason: string | null;
  latitude: number; longitude: number;
};
type Participant = { status: string; user: { id: string; name: string; handle: string } | null };
type Report = { id: string; reason: string; details: string | null; status: string; created_at: string; reporter: { name: string; handle: string } | null };

export default function AdminActivityDetailPage({ params }: { params: { id: string } }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'hide' | 'unhide' | 'cancel' | 'delete' | null>(null);
  const [saving, setSaving] = useState(false);
  const [featuredUntil, setFeaturedUntil] = useState('');
  const [featuredReason, setFeaturedReason] = useState('');
  const [savingFeatured, setSavingFeatured] = useState(false);

  function load() {
    fetch(`/api/admin/activities/${params.id}`).then((r) => r.json()).then((json) => {
      if (json.error) { setError(json.error); return; }
      setActivity(json.activity);
      setParticipants(json.participants);
      setReports(json.reports);
    });
  }
  useEffect(() => { load(); }, [params.id]);

  async function applyAction(action: typeof confirmAction) {
    if (!action) return;
    setSaving(true);
    const res = action === 'delete'
      ? await fetch(`/api/admin/activities/${params.id}`, { method: 'DELETE' })
      : await fetch(`/api/admin/activities/${params.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: action === 'hide' ? 'hidden' : action === 'unhide' ? 'active' : 'cancelled' })
        });
    setSaving(false);
    setConfirmAction(null);
    if (!res.ok) { alert("Couldn't complete that action — please try again."); return; }
    if (action === 'delete') { window.location.href = '/admin/activities'; return; }
    load();
  }

  async function toggleFeatured(next: boolean) {
    setSavingFeatured(true);
    const res = await fetch(`/api/admin/activities/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: next, featured_until: featuredUntil || null, featured_reason: featuredReason || null })
    });
    setSavingFeatured(false);
    if (!res.ok) { alert("Couldn't update Featured status — please try again."); return; }
    load();
  }

  if (error) return <div style={{ padding: 28 }}><ErrorState message={error} /></div>;
  if (!activity) return <LoadingState />;

  const state = activity.status === 'hidden' || activity.status === 'cancelled' ? activity.status : getActivityTimeState(activity.starts_at, activity.ends_at);
  const confirmCopy = {
    hide: { title: 'Hide this activity?', message: 'Removed from the public map and search, but not deleted. Reversible.' },
    unhide: { title: 'Unhide this activity?', message: 'It will become publicly visible again.', danger: false },
    cancel: { title: 'Cancel this activity?', message: "Attendees are notified automatically, same as an organizer's own cancellation. This can't be undone." },
    delete: { title: 'Permanently delete this activity?', message: 'Removes the activity and everything tied to it (RSVPs, comments, chat history). This cannot be undone.' }
  };

  return (
    <>
      <AdminHeader
        title={activity.title}
        subtitle={`Organized by ${activity.organizer?.name ?? 'unknown'}`}
        actions={<StatusBadge status={state} />}
      />
      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AdminCard title="Details">
            <DetailRow label="Organizer" value={activity.organizer ? `${activity.organizer.name} (@${activity.organizer.handle})` : 'Unknown'} />
            <DetailRow label="Created" value={new Date(activity.created_at).toLocaleString()} />
            <DetailRow label="Starts" value={new Date(activity.starts_at).toLocaleString()} />
            <DetailRow label="Ends" value={activity.ends_at ? new Date(activity.ends_at).toLocaleString() : 'Not set (defaults to start + 2h internally)'} />
            <DetailRow label="Recurring" value={activity.is_recurring ? 'Yes' : 'No'} />
            <DetailRow label="Visibility" value={activity.status === 'hidden' ? 'Hidden (admin)' : activity.status === 'cancelled' ? 'Cancelled' : 'Public'} />
            <DetailRow label="Capacity" value={String(activity.capacity)} />
            <DetailRow
              label="Coordinates"
              value={
                <a href={`https://www.google.com/maps?q=${activity.latitude},${activity.longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.violet, textDecoration: 'underline' }}>
                  {activity.latitude.toFixed(6)}, {activity.longitude.toFixed(6)} ↗
                </a>
              }
              last
            />
          </AdminCard>

          <AdminCard title={`Participants (${participants.length})`}>
            {participants.length === 0 ? <EmptyState message="Nobody has joined yet." /> : participants.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < participants.length - 1 ? `1px solid ${COLORS.borderLight}` : 'none', fontSize: 13.5 }}>
                <span>{p.user?.name ?? 'Unknown'} <span style={{ color: COLORS.textFaint }}>@{p.user?.handle}</span></span>
                <StatusBadge status={p.status} />
              </div>
            ))}
          </AdminCard>

          <AdminCard title={`Reports (${reports.length})`}>
            {reports.length === 0 ? <EmptyState message="No reports against this activity." /> : reports.map((r) => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 600 }}>
                  <span>{r.reason}</span>
                  <StatusBadge status={r.status} />
                </div>
                {r.details && <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 }}>"{r.details}"</div>}
                <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 2 }}>by {r.reporter?.name ?? 'unknown'} · {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </AdminCard>
          <AdminCard title="Featured">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: activity.featured ? 12 : 0 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{activity.featured ? 'Currently featured' : 'Not featured'}</div>
                <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>Future-ready for Explore — not shown to users yet.</div>
              </div>
              {!activity.featured ? (
                <button onClick={() => toggleFeatured(true)} disabled={savingFeatured} style={actionBtnStyle(false)}>Feature</button>
              ) : (
                <button onClick={() => toggleFeatured(false)} disabled={savingFeatured} style={actionBtnStyle(true)}>Remove from Featured</button>
              )}
            </div>
            {!activity.featured && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input type="date" value={featuredUntil} onChange={(e) => setFeaturedUntil(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 12.5 }} placeholder="Featured until (optional)" />
                <input value={featuredReason} onChange={(e) => setFeaturedReason(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 12.5 }} placeholder="Reason (internal only)" />
              </div>
            )}
            {activity.featured && activity.featured_until && <div style={{ fontSize: 12, color: COLORS.textSecondary }}>Until {new Date(activity.featured_until).toLocaleDateString()}</div>}
            {activity.featured && activity.featured_reason && <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>Reason: {activity.featured_reason}</div>}
          </AdminCard>

          <AdminNotes targetType="activity" targetId={activity.id} />
        </div>

        <AdminCard title="Actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href={`/?activity=${activity.id}`} target="_blank" rel="noreferrer" style={actionBtnStyle(false)}>Open Public Activity Page</a>
            {activity.status !== 'hidden' && <button onClick={() => setConfirmAction('hide')} style={actionBtnStyle(false)}>Hide</button>}
            {activity.status === 'hidden' && <button onClick={() => setConfirmAction('unhide')} style={actionBtnStyle(false)}>Unhide</button>}
            {activity.status !== 'cancelled' && <button onClick={() => setConfirmAction('cancel')} style={actionBtnStyle(true)}>Cancel</button>}
            <button onClick={() => setConfirmAction('delete')} style={actionBtnStyle(true)}>Delete</button>
          </div>
        </AdminCard>
      </div>

      <ConfirmationDialog
        open={confirmAction !== null}
        title={confirmAction ? confirmCopy[confirmAction].title : ''}
        message={confirmAction ? confirmCopy[confirmAction].message : ''}
        confirmLabel={confirmAction ? confirmAction[0].toUpperCase() + confirmAction.slice(1) : ''}
        danger={confirmAction ? (confirmCopy[confirmAction] as any).danger ?? true : true}
        loading={saving}
        onConfirm={() => applyAction(confirmAction)}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}

function DetailRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: last ? 'none' : `1px solid ${COLORS.borderLight}`, fontSize: 13.5 }}>
      <span style={{ color: COLORS.textSecondary }}>{label}</span>
      <span style={{ color: COLORS.ink, fontWeight: 600 }}>{value}</span>
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
