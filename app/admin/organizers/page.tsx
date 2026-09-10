'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminTable, { type AdminTableColumn } from '@/components/admin/AdminTable';
import Avatar from '@/components/Avatar';
import LoadingState from '@/components/LoadingState';
import { COLORS } from '@/lib/designTokens';

type Organizer = {
  id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null; is_verified_organizer: boolean;
  activitiesCreated: number; upcomingCount: number; liveCount: number; cancelledCount: number; totalJoins: number;
};

export default function AdminOrganizersPage() {
  const [organizers, setOrganizers] = useState<Organizer[] | null>(null);

  useEffect(() => {
    fetch('/api/admin/organizers').then((r) => r.json()).then((json) => setOrganizers(json.organizers ?? []));
  }, []);

  if (!organizers) return <LoadingState />;

  const columns: AdminTableColumn<Organizer>[] = [
    {
      key: 'name', label: 'Organizer', render: (o) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={o.name} color={o.avatar_color} avatarUrl={o.avatar_url} size="sm" />
          <div>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {o.name}
              {o.is_verified_organizer && <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.violet, background: COLORS.violetTint, borderRadius: 100, padding: '1px 6px' }}>✓</span>}
            </div>
            <div style={{ fontSize: 12, color: COLORS.textFaint }}>@{o.handle}</div>
          </div>
        </div>
      )
    },
    { key: 'created', label: 'Activities Created', render: (o) => o.activitiesCreated },
    { key: 'upcoming', label: 'Upcoming', render: (o) => o.upcomingCount },
    { key: 'live', label: 'Live', render: (o) => o.liveCount },
    { key: 'joins', label: 'Total Joins', render: (o) => o.totalJoins },
    {
      key: 'cancelled', label: 'Cancelled', render: (o) => (
        // A simple, honest signal worth flagging visually — a high
        // cancellation count relative to activities created is exactly the
        // "spam or abnormal behavior" pattern this page exists to surface.
        <span style={{ color: o.cancelledCount > 0 && o.cancelledCount >= o.activitiesCreated * 0.4 ? COLORS.danger : COLORS.ink, fontWeight: o.cancelledCount > 0 ? 700 : 400 }}>
          {o.cancelledCount}
        </span>
      )
    }
  ];

  return (
    <>
      <AdminHeader title="Organizers" subtitle="Ranked by activities created — community leaders and outliers alike" />
      <div style={{ padding: 28 }}>
        <AdminTable
          columns={columns}
          rows={organizers}
          emptyMessage="No organizers yet."
          onRowClick={(o) => { window.location.href = `/admin/users/${o.id}`; }}
        />
      </div>
    </>
  );
}
