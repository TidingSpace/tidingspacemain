'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import StatCard from '@/components/admin/StatCard';
import MiniLineChart from '@/components/admin/MiniLineChart';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/lib/designTokens';

type Series = { day: string; count: number }[];
type Analytics = {
  newUsers: Series; activitiesCreated: Series; activitiesJoined: Series; messagesSent: Series; groupsCreated: Series;
  dau: number; mau: number;
  topCategories: { category: string; count: number }[];
  topOrganizers: { id: string; name: string; handle: string; count: number }[];
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/analytics').then((r) => r.json()).then((json) => {
      if (json.error) setError(json.error);
      else setData(json);
    });
  }, []);

  if (error) return <div style={{ padding: 28 }}><ErrorState message={error} /></div>;
  if (!data) return <LoadingState />;

  return (
    <>
      <AdminHeader title="Analytics" subtitle="Last 30 days · computed from real activity, not estimated" />
      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <StatCard label="Daily Active Users" value={data.dau} hint="Active in the last 24h, right now — not a historical trend (see note below)" />
          <StatCard label="Monthly Active Users" value={data.mau} hint="Active in the last 30 days, right now" />
        </div>
        <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: -8 }}>
          Note: DAU/MAU here are current snapshots, not day-by-day historical trends, and Returning Users isn't shown at all — last_seen_at stores only a user's most recent activity, not a log of every day they were active, so a true historical trend can't be reconstructed from it honestly. That would need a dedicated daily activity log table.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
          <AdminCard title="New Users"><MiniLineChart data={data.newUsers} /></AdminCard>
          <AdminCard title="Activities Created"><MiniLineChart data={data.activitiesCreated} /></AdminCard>
          <AdminCard title="Activities Joined (RSVPs)"><MiniLineChart data={data.activitiesJoined} /></AdminCard>
          <AdminCard title="Messages Sent"><MiniLineChart data={data.messagesSent} /></AdminCard>
          <AdminCard title="Groups Created"><MiniLineChart data={data.groupsCreated} /></AdminCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          <AdminCard title="Top Categories">
            {data.topCategories.length === 0 ? <EmptyState message="No activities in this window." /> : data.topCategories.map((c) => (
              <Row key={c.category} left={c.category} right={`${c.count} created`} />
            ))}
          </AdminCard>
          <AdminCard title="Most Active Organizers">
            {data.topOrganizers.length === 0 ? <EmptyState message="No organizers in this window." /> : data.topOrganizers.map((o) => (
              <Row key={o.id} left={<a href={`/admin/users/${o.id}`} style={{ color: COLORS.ink, fontWeight: 600, textDecoration: 'none' }}>{o.name} <span style={{ color: COLORS.textFaint, fontWeight: 400 }}>@{o.handle}</span></a>} right={`${o.count} created`} />
            ))}
          </AdminCard>
        </div>
      </div>
    </>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${COLORS.borderLight}`, fontSize: 13.5 }}>
      <div>{left}</div>
      <div style={{ color: COLORS.textFaint, fontSize: 12.5 }}>{right}</div>
    </div>
  );
}
