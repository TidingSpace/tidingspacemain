'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { COLORS, RADIUS, FONT } from '@/lib/designTokens';
import AdminHeader from '@/components/admin/AdminHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import ConfirmationDialog from '@/components/admin/ConfirmationDialog';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';

type Report = {
  id: string; reason: string; details: string | null; status: 'open' | 'reviewed' | 'dismissed'; created_at: string;
  reporter: { id: string; name: string; handle: string } | null;
  reported_user: { id: string; name: string; handle: string } | null;
  reported_activity: { id: string; title: string; status: string } | null;
  reported_post: { id: string; text: string | null } | null;
  reported_group: { id: string; name: string } | null;
  reported_direct_message: { id: string; text: string | null; sender: { name: string } | null } | null;
  reported_group_message: { id: string; text: string | null; author: { name: string } | null } | null;
};

type PendingAction = { report: Report; action: 'dismiss' | 'hide_content' | 'delete_content' | 'suspend_user' };

const STATUS_TABS = [
  { key: 'open', label: 'Pending' },
  { key: 'reviewed', label: 'Resolved' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' }
];
const TYPE_FILTERS = [
  { key: 'all', label: 'All Types' },
  { key: 'activity', label: 'Activities' },
  { key: 'post', label: 'Posts' },
  { key: 'user', label: 'Users' },
  { key: 'group', label: 'Groups' },
  { key: 'message', label: 'Messages' }
];
const REASON_FILTERS = [
  { key: 'all', label: 'All Reasons' },
  { key: 'Spam', label: 'Spam' },
  { key: 'Harassment', label: 'Harassment' },
  { key: 'Fake activity', label: 'Fake activity' },
  { key: 'Inappropriate content', label: 'Inappropriate content' },
  { key: 'Other', label: 'Other' }
];

export default function AdminReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userFilter = searchParams.get('user');

  const [status, setStatus] = useState('open');
  const [type, setType] = useState('all');
  const [reason, setReason] = useState('all');
  const [reports, setReports] = useState<Report[]>([]);
  const [filteredUser, setFilteredUser] = useState<{ id: string; name: string; handle: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    const userParam = userFilter ? `&user=${encodeURIComponent(userFilter)}` : '';
    fetch(`/api/admin/reports?status=${status}&type=${type}&reason=${encodeURIComponent(reason)}${userParam}`).then((r) => r.json()).then((json) => {
      if (json.error) { setError(json.error); setLoading(false); return; }
      setReports(json.reports ?? []);
      setFilteredUser(json.filteredUser ?? null);
      setLoading(false);
    });
  }
  useEffect(() => { load(); }, [status, type, reason, userFilter]);

  function clearUserFilter() {
    router.push('/admin/reports');
  }

  async function applyAction(reportId: string, action: PendingAction['action']) {
    setSaving(true);
    const res = await fetch(`/api/admin/reports/${reportId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action })
    });
    setSaving(false);
    setPending(null);
    if (!res.ok) { const j = await res.json(); alert(j.error ?? "Couldn't complete that action."); return; }
    load();
  }

  return (
    <>
      <AdminHeader title="Reports" subtitle="Moderation queue" />
      <div style={{ padding: 28 }}>
        {userFilter && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: COLORS.violetTint, borderRadius: RADIUS.sm, padding: '10px 14px', marginBottom: 14, fontSize: 13.5
          }}>
            <span style={{ color: COLORS.violetDeep, fontWeight: 600 }}>
              Showing reports about {filteredUser ? `${filteredUser.name} (@${filteredUser.handle})` : 'this user'}
            </span>
            <button onClick={clearUserFilter} style={{ background: 'none', border: 'none', color: COLORS.violetDeep, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filter
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setStatus(t.key)} style={tabStyle(status === t.key)}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <FilterSelect label="Content type" value={type} onChange={setType} options={TYPE_FILTERS} />
          <FilterSelect label="Reason" value={reason} onChange={setReason} options={REASON_FILTERS} />
        </div>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && reports.length === 0 && (
          <EmptyState message={`No reports match this view.\nTry a different filter, or check back later.`} />
        )}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} onAction={(action) => setPending({ report: r, action })} />
            ))}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={pending !== null}
        title={pending ? actionCopy[pending.action].title : ''}
        message={pending ? actionCopy[pending.action].message : ''}
        confirmLabel={pending ? actionCopy[pending.action].confirmLabel : ''}
        danger={pending?.action !== 'dismiss'}
        loading={saving}
        onConfirm={() => pending && applyAction(pending.report.id, pending.action)}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { key: string; label: string }[] }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '7px 10px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 13, background: '#fff' }}>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
    </div>
  );
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 14px', borderRadius: RADIUS.pill, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? COLORS.violet : COLORS.surfaceAlt, color: active ? '#fff' : COLORS.textSecondary
  };
}

const actionCopy = {
  dismiss: { title: 'Dismiss this report?', message: 'No action will be taken against the reported content or user.', confirmLabel: 'Dismiss' },
  hide_content: { title: 'Hide this content?', message: "It will be removed from public view but not deleted — this can be reversed (except messages, which are removed permanently). The report will be marked resolved.", confirmLabel: 'Hide' },
  delete_content: { title: 'Permanently delete this content?', message: 'This cannot be undone. The report will be marked resolved.', confirmLabel: 'Delete' },
  suspend_user: { title: 'Suspend the reported user?', message: 'They will be blocked from creating activities, posts, and comments until reinstated. The report will be marked resolved.', confirmLabel: 'Suspend' }
};

function ReportCard({ report, onAction }: { report: Report; onAction: (action: PendingAction['action']) => void }) {
  const target = report.reported_user
    ? { kind: 'User', label: `${report.reported_user.name} (@${report.reported_user.handle})`, href: `/profile/${report.reported_user.id}` }
    : report.reported_activity
    ? { kind: 'Activity', label: report.reported_activity.title, href: `/admin/activities/${report.reported_activity.id}` }
    : report.reported_post
    ? { kind: 'Post', label: (report.reported_post.text ?? '').slice(0, 80) || '(no text)', href: `/feed/${report.reported_post.id}` }
    : report.reported_group
    ? { kind: 'Group', label: report.reported_group.name, href: `/groups/${report.reported_group.id}` }
    : report.reported_direct_message
    ? { kind: 'Direct Message', label: `"${(report.reported_direct_message.text ?? '').slice(0, 80) || '(no text)'}" — from ${report.reported_direct_message.sender?.name ?? 'unknown'}`, href: null }
    : report.reported_group_message
    ? { kind: 'Group Message', label: `"${(report.reported_group_message.text ?? '').slice(0, 80) || '(no text)'}" — from ${report.reported_group_message.author?.name ?? 'unknown'}`, href: null }
    : { kind: 'Content', label: 'No longer exists', href: null };

  const hasContent = !!(report.reported_activity || report.reported_post || report.reported_group || report.reported_direct_message || report.reported_group_message);

  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ ...FONT.cardTitle, color: COLORS.ink }}>{report.reason}</div>
          <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 2 }}>
            {target.kind} · Reported by {report.reporter?.name ?? 'unknown'} · {new Date(report.created_at).toLocaleString()}
          </div>
        </div>
        <StatusBadge status={report.status === 'open' ? 'open' : report.status} />
      </div>

      {target.href ? (
        <a href={target.href} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: COLORS.violet, fontWeight: 600, textDecoration: 'none' }}>{target.label} ↗</a>
      ) : (
        <div style={{ fontSize: 13.5, color: COLORS.textSecondary, fontStyle: target.kind.includes('Message') ? 'italic' : 'normal' }}>{target.label}</div>
      )}

      {report.details && <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 8, lineHeight: 1.5 }}>Reporter's note: "{report.details}"</div>}

      {report.status === 'open' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={() => onAction('dismiss')} style={actionBtnStyle(false)}>Dismiss</button>
          {hasContent && <button onClick={() => onAction('hide_content')} style={actionBtnStyle(false)}>Hide Content</button>}
          {hasContent && <button onClick={() => onAction('delete_content')} style={actionBtnStyle(true)}>Delete Content</button>}
          {report.reported_user && <button onClick={() => onAction('suspend_user')} style={actionBtnStyle(true)}>Suspend User</button>}
        </div>
      )}
    </div>
  );
}

function actionBtnStyle(danger: boolean): React.CSSProperties {
  return {
    padding: '7px 13px', borderRadius: RADIUS.sm, border: `1px solid ${danger ? COLORS.danger : COLORS.border}`,
    background: '#fff', color: danger ? COLORS.danger : COLORS.ink, fontWeight: 600, fontSize: 12.5, cursor: 'pointer'
  };
}
