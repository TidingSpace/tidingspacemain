'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import SearchToolbar from '@/components/admin/SearchToolbar';
import StatusBadge from '@/components/admin/StatusBadge';
import ConfirmationDialog from '@/components/admin/ConfirmationDialog';
import CategoryIcon from '@/components/CategoryIcon';
import { COLORS } from '@/lib/designTokens';
import { getActivityTimeState } from '@/lib/activityTimeState';

type ActivityRow = {
  id: string; title: string; category: string; starts_at: string; ends_at: string | null; status: string;
  organizer: { name: string } | null;
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'finished', label: 'Finished' },
  { key: 'reported', label: 'Reported' }
];

export default function AdminActivitiesPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{ activity: ActivityRow; type: 'hide' | 'delete' | 'cancel' } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => { setPage(0); }, [debouncedQuery, filter]);

  function load() {
    setLoading(true);
    fetch(`/api/admin/activities?query=${encodeURIComponent(debouncedQuery)}&filter=${filter}&page=${page}`)
      .then((r) => r.json())
      .then((json) => {
        setActivities(json.activities ?? []);
        setTotalCount(json.totalCount ?? 0);
        setLoading(false);
      });
  }

  useEffect(() => { load(); }, [debouncedQuery, filter, page]);

  async function applyAction(activity: ActivityRow, type: 'hide' | 'delete' | 'cancel') {
    setSaving(true);
    const res = await fetch(`/api/admin/activities/${activity.id}`, {
      method: type === 'delete' ? 'DELETE' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: type === 'delete' ? undefined : JSON.stringify({ status: type === 'hide' ? 'hidden' : 'cancelled' })
    });
    setSaving(false);
    setConfirmAction(null);
    if (!res.ok) { alert("Couldn't complete that action — please try again."); return; }
    load();
  }

  const columns: AdminTableColumn<ActivityRow>[] = [
    {
      key: 'title', label: 'Activity', render: (a) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CategoryIcon categoryKey={a.category} size={18} />
          <div>
            <div style={{ fontWeight: 600 }}>{a.title}</div>
            <div style={{ fontSize: 12, color: COLORS.textFaint }}>{a.organizer?.name ?? 'Unknown organizer'}</div>
          </div>
        </div>
      )
    },
    { key: 'when', label: 'Starts', render: (a) => new Date(a.starts_at).toLocaleString() },
    {
      key: 'status', label: 'Status', render: (a) => {
        const state = a.status === 'cancelled' || a.status === 'hidden' ? a.status : getActivityTimeState(a.starts_at, a.ends_at);
        return <StatusBadge status={state} />;
      }
    },
    {
      key: 'actions', label: '', render: (a) => (
        <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <a href={`/?activity=${a.id}`} target="_blank" rel="noreferrer" style={miniBtnStyle}>View</a>
          <a href={`/activities/${a.id}/edit`} target="_blank" rel="noreferrer" style={miniBtnStyle}>Edit</a>
          {a.status !== 'hidden' && <button onClick={() => setConfirmAction({ activity: a, type: 'hide' })} style={miniBtnStyle}>Hide</button>}
          {a.status !== 'cancelled' && <button onClick={() => setConfirmAction({ activity: a, type: 'cancel' })} style={miniBtnStyle}>Cancel</button>}
          <button onClick={() => setConfirmAction({ activity: a, type: 'delete' })} style={{ ...miniBtnStyle, color: COLORS.danger, borderColor: COLORS.danger }}>Delete</button>
        </div>
      )
    }
  ];

  const confirmCopy = {
    hide: { title: 'Hide this activity?', message: 'It will be removed from the public map and search, but not deleted — attendees keep their RSVPs and chat history. This can be reversed.' },
    cancel: { title: 'Cancel this activity?', message: "This is the same cancellation an organizer would trigger — attendees are notified automatically. This can't be undone." },
    delete: { title: 'Permanently delete this activity?', message: 'This removes the activity and everything tied to it (RSVPs, comments, chat history) completely. This cannot be undone.' }
  };

  return (
    <>
      <AdminHeader title="Activities" subtitle={`${totalCount} matching`} />
      <div style={{ padding: 28 }}>
        <SearchToolbar
          value={query} onChange={setQuery} placeholder="Search by title or category…"
          filters={FILTERS} activeFilter={filter} onFilterChange={setFilter}
        />
        <AdminTable
          columns={columns}
          rows={activities}
          loading={loading}
          emptyMessage="No activities match this view."
          page={page}
          pageSize={20}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </div>

      <ConfirmationDialog
        open={confirmAction !== null}
        title={confirmAction ? confirmCopy[confirmAction.type].title : ''}
        message={confirmAction ? confirmCopy[confirmAction.type].message : ''}
        confirmLabel={confirmAction ? confirmAction.type[0].toUpperCase() + confirmAction.type.slice(1) : ''}
        loading={saving}
        onConfirm={() => confirmAction && applyAction(confirmAction.activity, confirmAction.type)}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}

const miniBtnStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#fff',
  color: COLORS.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none'
};
