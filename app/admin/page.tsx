'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import StatCard from '@/components/admin/StatCard';
import AdminCard from '@/components/admin/AdminCard';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { COLORS } from '@/lib/designTokens';

type TimelineEvent = { id: string; type: string; text: string; created_at: string };
type Dashboard = {
  stats: {
    totalUsers: number; activeUsersToday: number; activitiesToday: number; liveActivities: number;
    groups: number; messagesToday: number; openReports: number;
  };
  timeline: TimelineEvent[];
};

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/dashboard').then((r) => r.json()).then((json) => {
      if (json.error) setError(json.error);
      else setData(json);
    });
  }, []);

  if (error) return <div style={{ padding: 28 }}><ErrorState message={error} /></div>;
  if (!data) return <LoadingState />;

  const icon = (path: React.ReactNode) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{path}</svg>;

  return (
    <>
      <AdminHeader title="Dashboard" subtitle="Platform overview" />
      <div style={{ padding: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard label="Total Users" value={data.stats.totalUsers} icon={icon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>)} />
          <StatCard label="Active Today" value={data.stats.activeUsersToday} hint="Seen in the last 2 min, at load time" icon={icon(<circle cx="12" cy="12" r="4" />)} />
          <StatCard label="Activities Today" value={data.stats.activitiesToday} icon={icon(<rect x="3" y="4" width="18" height="18" rx="2" />)} />
          <StatCard label="Live Now" value={data.stats.liveActivities} icon={icon(<circle cx="12" cy="12" r="10" />)} />
          <StatCard label="Groups" value={data.stats.groups} icon={icon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>)} />
          <StatCard label="Messages Today" value={data.stats.messagesToday} icon={icon(<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5H3l3-3a8.38 8.38 0 0 1 15-5.5z" />)} />
          <StatCard label="Reports Awaiting Review" value={data.stats.openReports} hint={data.stats.openReports > 0 ? 'Needs attention' : undefined} icon={icon(<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />)} />
        </div>

        <AdminCard title="Activity Timeline">
          {data.timeline.length === 0 && <Empty />}
          {data.timeline.map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${COLORS.borderLight}` }}>
              <div style={{ width: 54, flexShrink: 0, fontSize: 12, color: COLORS.textFaint, paddingTop: 1 }}>
                {new Date(e.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: timelineDotColor(e.type) }} />
              <div style={{ fontSize: 13.5, color: COLORS.ink }}>{e.text}</div>
            </div>
          ))}
        </AdminCard>
      </div>
    </>
  );
}

function Empty() {
  return <div style={{ fontSize: 13, color: COLORS.textFaint, padding: '8px 0' }}>Nothing yet.</div>;
}

function timelineDotColor(type: string): string {
  switch (type) {
    case 'signup': return COLORS.violet;
    case 'activity': return COLORS.success;
    case 'report': return COLORS.danger;
    case 'group': return COLORS.violetDeep;
    case 'join': return COLORS.textSecondary;
    default: return COLORS.textFaint;
  }
}
