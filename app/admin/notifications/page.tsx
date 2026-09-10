'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import StatusBadge from '@/components/admin/StatusBadge';
import ConfirmationDialog from '@/components/admin/ConfirmationDialog';
import LoadingState from '@/components/LoadingState';
import { COLORS, RADIUS } from '@/lib/designTokens';

type Broadcast = {
  id: string; title: string; message: string; notification_type: string; audience_type: string; audience_value: string | null;
  status: string; scheduled_at: string | null; sent_at: string | null; recipient_count: number; failure_reason: string | null;
  created_at: string; created_by_profile: { name: string; handle: string } | null;
};

const NOTIF_TYPES = [
  { key: 'information', label: 'Information' },
  { key: 'announcement', label: 'Announcement' },
  { key: 'warning', label: 'Warning' },
  { key: 'maintenance', label: 'Maintenance' }
];
const AUDIENCES = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'city', label: 'Specific city' },
  { key: 'category', label: 'Specific activity category' },
  { key: 'organizers', label: 'Organizers only' },
  { key: 'user', label: 'Individual user' }
];

export default function AdminNotificationsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifType, setNotifType] = useState('information');
  const [audienceType, setAudienceType] = useState('everyone');
  const [audienceValue, setAudienceValue] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmSend, setConfirmSend] = useState<{ mode: 'new' | 'existing'; id?: string } | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/admin/broadcasts?page=${page}`).then((r) => r.json()).then((json) => {
      setBroadcasts(json.broadcasts ?? []);
      setTotalCount(json.totalCount ?? 0);
      setLoading(false);
    });
  }
  useEffect(() => { load(); }, [page]);
  useEffect(() => { fetch('/api/categories').then((r) => r.json()).then((json) => setCategories(json.categories ?? [])); }, []);

  function resetForm() {
    setTitle(''); setMessage(''); setNotifType('information'); setAudienceType('everyone'); setAudienceValue(''); setScheduledAt('');
  }

  async function saveDraft() {
    setSaving(true);
    const res = await fetch('/api/admin/broadcasts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, notification_type: notifType, audience_type: audienceType, audience_value: audienceValue, scheduled_at: scheduledAt || null, sendNow: false })
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json(); alert(j.error ?? "Couldn't save this."); return; }
    resetForm();
    setPage(0);
    load();
  }

  async function sendNew() {
    setSaving(true);
    const res = await fetch('/api/admin/broadcasts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, notification_type: notifType, audience_type: audienceType, audience_value: audienceValue, sendNow: true })
    });
    setSaving(false);
    setConfirmSend(null);
    if (!res.ok) { const j = await res.json(); alert(j.error ?? "Couldn't send this."); return; }
    resetForm();
    setPage(0);
    load();
  }

  async function sendExisting(id: string) {
    setSaving(true);
    const res = await fetch(`/api/admin/broadcasts/${id}/send`, { method: 'POST' });
    setSaving(false);
    setConfirmSend(null);
    if (!res.ok) { const j = await res.json(); alert(j.error ?? "Couldn't send this."); return; }
    load();
  }

  const audienceLabel = (b: Broadcast) => {
    if (b.audience_type === 'everyone') return 'Everyone';
    if (b.audience_type === 'organizers') return 'Organizers only';
    if (b.audience_type === 'category') return `Category: ${b.audience_value}`;
    if (b.audience_type === 'user') return `User: ${b.audience_value?.slice(0, 8)}…`;
    if (b.audience_type === 'city') return `City: ${b.audience_value} (unsupported)`;
    return b.audience_type;
  };

  const columns: AdminTableColumn<Broadcast>[] = [
    { key: 'title', label: 'Title', render: (b) => <div><div style={{ fontWeight: 600 }}>{b.title}</div><div style={{ fontSize: 12, color: COLORS.textFaint }}>{b.notification_type}</div></div> },
    { key: 'audience', label: 'Audience', render: (b) => audienceLabel(b) },
    { key: 'status', label: 'Status', render: (b) => <StatusBadge status={b.status} /> },
    { key: 'recipients', label: 'Recipients', render: (b) => b.status === 'sent' ? b.recipient_count : '—' },
    { key: 'when', label: 'Created', render: (b) => new Date(b.created_at).toLocaleString() },
    {
      key: 'actions', label: '', render: (b) => (
        (b.status === 'draft' || b.status === 'scheduled') ? (
          <button onClick={() => setConfirmSend({ mode: 'existing', id: b.id })} style={miniBtnStyle}>Send Now</button>
        ) : b.status === 'failed' ? (
          <span style={{ fontSize: 12, color: COLORS.danger }}>{b.failure_reason}</span>
        ) : null
      )
    }
  ];

  return (
    <>
      <AdminHeader title="Notifications" subtitle="Send platform-wide announcements to your users" />
      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <AdminCard title="Compose">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <FieldLabel>Title</FieldLabel>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Scheduled maintenance tonight" />
            </div>
            <div>
              <FieldLabel>Type</FieldLabel>
              <select value={notifType} onChange={(e) => setNotifType(e.target.value)} style={inputStyle}>
                {NOTIF_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <FieldLabel>Message</FieldLabel>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginBottom: 14 }} placeholder="What do you want to tell them?" />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 6 }}>
            <div>
              <FieldLabel>Audience</FieldLabel>
              <select value={audienceType} onChange={(e) => { setAudienceType(e.target.value); setAudienceValue(''); }} style={inputStyle}>
                {AUDIENCES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </div>
            {audienceType === 'category' && (
              <div>
                <FieldLabel>Category</FieldLabel>
                <select value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)} style={inputStyle}>
                  <option value="">Select…</option>
                  {categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
            )}
            {audienceType === 'user' && (
              <div>
                <FieldLabel>User ID</FieldLabel>
                <input value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)} style={inputStyle} placeholder="Find this on the Users page" />
              </div>
            )}
            {audienceType === 'city' && (
              <div>
                <FieldLabel>City (not yet functional — see note below)</FieldLabel>
                <input value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)} style={inputStyle} placeholder="e.g. San Francisco" />
              </div>
            )}
            <div>
              <FieldLabel>Scheduled time (optional)</FieldLabel>
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {audienceType === 'city' && (
            <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 6 }}>
              City targeting has no real backend support yet — profiles don't store a city anywhere. Saving this will mark the broadcast "failed" with a clear reason rather than silently send to the wrong people.
            </div>
          )}
          {scheduledAt && (
            <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 6 }}>
              This will be sent automatically once its scheduled time arrives (checked once daily, since Vercel's free tier only allows daily cron jobs — see the comment in the cron route for how to run this more often on a paid plan). You can still send it early with Send Now below if needed.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={saveDraft} disabled={saving || !title.trim() || !message.trim()} style={secondaryBtnStyle}>
              {scheduledAt ? 'Save as Scheduled' : 'Save as Draft'}
            </button>
            <button onClick={() => setConfirmSend({ mode: 'new' })} disabled={saving || !title.trim() || !message.trim()} style={primaryBtnStyle}>
              Send Immediately
            </button>
          </div>
        </AdminCard>

        <AdminCard title="History">
          <AdminTable
            columns={columns}
            rows={broadcasts}
            loading={loading}
            emptyMessage="No notifications sent yet."
            page={page}
            pageSize={20}
            totalCount={totalCount}
            onPageChange={setPage}
          />
        </AdminCard>
      </div>

      <ConfirmationDialog
        open={confirmSend !== null}
        title="Send this notification now?"
        message="This will be delivered immediately to the selected audience. This can't be undone once sent."
        confirmLabel="Send Now"
        loading={saving}
        onConfirm={() => confirmSend?.mode === 'new' ? sendNew() : confirmSend?.id && sendExisting(confirmSend.id)}
        onCancel={() => setConfirmSend(null)}
      />
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6 }}>{children}</label>;
}

const inputStyle: React.CSSProperties = { width: '100%', padding: 9, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' };
const primaryBtnStyle: React.CSSProperties = { padding: '10px 18px', borderRadius: RADIUS.sm, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const secondaryBtnStyle: React.CSSProperties = { padding: '10px 18px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.ink, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' };
const miniBtnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer' };
