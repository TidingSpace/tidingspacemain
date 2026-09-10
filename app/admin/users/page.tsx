'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import SearchToolbar from '@/components/admin/SearchToolbar';
import StatusBadge from '@/components/admin/StatusBadge';
import Avatar from '@/components/Avatar';
import { COLORS } from '@/lib/designTokens';

type UserRow = { id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null; created_at: string; account_status: string };

export default function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => { setPage(0); }, [debouncedQuery]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/users?query=${encodeURIComponent(debouncedQuery)}&page=${page}`)
      .then((r) => r.json())
      .then((json) => {
        setUsers(json.users ?? []);
        setTotalCount(json.totalCount ?? 0);
        setLoading(false);
      });
  }, [debouncedQuery, page]);

  const columns: AdminTableColumn<UserRow>[] = [
    {
      key: 'name', label: 'Name', render: (u) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={u.name} color={u.avatar_color} avatarUrl={u.avatar_url} size="sm" />
          <div>
            <div style={{ fontWeight: 600 }}>{u.name}</div>
            <div style={{ fontSize: 12, color: COLORS.textFaint }}>@{u.handle}</div>
          </div>
        </div>
      )
    },
    { key: 'status', label: 'Status', render: (u) => <StatusBadge status={u.account_status ?? 'active'} /> },
    { key: 'created', label: 'Joined', render: (u) => new Date(u.created_at).toLocaleDateString() },
    { key: 'id', label: 'User ID', render: (u) => <span style={{ fontSize: 11.5, color: COLORS.textFaint, fontFamily: 'monospace' }}>{u.id.slice(0, 8)}…</span> }
  ];

  return (
    <>
      <AdminHeader title="Users" subtitle={`${totalCount} total`} />
      <div style={{ padding: 28 }}>
        <SearchToolbar value={query} onChange={setQuery} placeholder="Search by name, username, email, or user ID…" />
        <AdminTable
          columns={columns}
          rows={users}
          loading={loading}
          emptyMessage={debouncedQuery ? 'No users match that search.' : 'No users yet.'}
          page={page}
          pageSize={20}
          totalCount={totalCount}
          onPageChange={setPage}
          onRowClick={(u) => { window.location.href = `/admin/users/${u.id}`; }}
        />
      </div>
    </>
  );
}
