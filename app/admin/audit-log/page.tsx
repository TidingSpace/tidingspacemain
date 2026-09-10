'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import { COLORS } from '@/lib/designTokens';

type Entry = {
  id: string; action: string; target_type: string; target_id: string | null; details: string | null; created_at: string;
  admin: { name: string; handle: string } | null;
};

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/audit-log?page=${page}`).then((r) => r.json()).then((json) => {
      setEntries(json.entries ?? []);
      setTotalCount(json.totalCount ?? 0);
      setLoading(false);
    });
  }, [page]);

  const columns: AdminTableColumn<Entry>[] = [
    { key: 'admin', label: 'Admin', render: (e) => e.admin ? `${e.admin.name} (@${e.admin.handle})` : 'Unknown admin' },
    { key: 'action', label: 'Action', render: (e) => <span style={{ fontWeight: 600 }}>{e.action}</span> },
    { key: 'target', label: 'Target', render: (e) => <span style={{ color: COLORS.textSecondary }}>{e.target_type}{e.details ? ` — ${e.details}` : ''}</span> },
    { key: 'when', label: 'Timestamp', render: (e) => new Date(e.created_at).toLocaleString() }
  ];

  return (
    <>
      <AdminHeader title="Audit Log" subtitle="Every admin action, logged automatically" />
      <div style={{ padding: 28 }}>
        <AdminTable
          columns={columns}
          rows={entries}
          loading={loading}
          emptyMessage="No admin actions logged yet."
          page={page}
          pageSize={30}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      </div>
    </>
  );
}
