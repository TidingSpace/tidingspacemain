'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { COLORS } from '@/lib/designTokens';

type Data = {
  mostReportedUsers: { id: string; count: number; profile?: { name: string; handle: string } }[];
  mostReportedActivities: { id: string; count: number; activity?: { title: string } }[];
  mostReportedGroups: { id: string; count: number; group?: { name: string } }[];
  cancellationOutliers: { id: string; name: string; handle: string; total: number; cancelled: number; rate: number }[];
  signupsLast24h: number;
  excessiveCreators: { id: string; name: string; handle: string; count: number }[];
  recentBans: { id: string; targetName: string | null; admin: string; created_at: string }[];
  recentSuspensions: { id: string; targetName: string | null; admin: string; created_at: string }[];
};

export default function TrustSafetyPage() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    fetch('/api/admin/trust-safety').then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <>
      <AdminHeader title="Trust & Safety" subtitle="Proactive signals, not a moderation queue — see Reports for that" />
      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <AdminCard title="Most Reported Users">
          {data.mostReportedUsers.length === 0 ? <EmptyState message="No repeated user reports." /> : data.mostReportedUsers.map((r) => (
            <Row key={r.id} left={<a href={`/admin/users/${r.id}`} style={linkStyle}>{r.profile?.name ?? 'Unknown'} <span style={{ color: COLORS.textFaint }}>@{r.profile?.handle}</span></a>} right={`${r.count} reports`} />
          ))}
        </AdminCard>

        <AdminCard title="Most Reported Activities">
          {data.mostReportedActivities.length === 0 ? <EmptyState message="No repeated activity reports." /> : data.mostReportedActivities.map((r) => (
            <Row key={r.id} left={<a href={`/admin/activities/${r.id}`} style={linkStyle}>{r.activity?.title ?? 'Unknown'}</a>} right={`${r.count} reports`} />
          ))}
        </AdminCard>

        <AdminCard title="Most Reported Groups">
          {data.mostReportedGroups.length === 0 ? <EmptyState message="No repeated group reports." /> : data.mostReportedGroups.map((r) => (
            <Row key={r.id} left={<a href={`/groups/${r.id}`} target="_blank" rel="noreferrer" style={linkStyle}>{r.group?.name ?? 'Unknown'}</a>} right={`${r.count} reports`} />
          ))}
        </AdminCard>

        <AdminCard title="Unusually High Cancellation Rates">
          {data.cancellationOutliers.length === 0 ? <EmptyState message="No organizers currently stand out." /> : data.cancellationOutliers.map((o) => (
            <Row key={o.id} left={<a href={`/admin/users/${o.id}`} style={linkStyle}>{o.name} <span style={{ color: COLORS.textFaint }}>@{o.handle}</span></a>} right={`${o.cancelled}/${o.total} cancelled (${Math.round(o.rate * 100)}%)`} />
          ))}
        </AdminCard>

        <AdminCard title="Account Creation, Last 24h">
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.ink }}>{data.signupsLast24h}</div>
          <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4 }}>
            TODO: flagging this as a genuine "spike" needs a rolling baseline (e.g. average daily signups over the last 30 days) to compare against, which isn't computed yet — this is the raw count only.
          </div>
        </AdminCard>

        <AdminCard title="Recent Bans">
          {data.recentBans.length === 0 ? <EmptyState message="No bans issued recently." /> : data.recentBans.map((b) => (
            <Row key={b.id} left={b.targetName ?? 'Unknown user'} right={`by ${b.admin} · ${new Date(b.created_at).toLocaleDateString()}`} />
          ))}
        </AdminCard>

        <AdminCard title="Recent Suspensions">
          {data.recentSuspensions.length === 0 ? <EmptyState message="No suspensions issued recently." /> : data.recentSuspensions.map((s) => (
            <Row key={s.id} left={s.targetName ?? 'Unknown user'} right={`by ${s.admin} · ${new Date(s.created_at).toLocaleDateString()}`} />
          ))}
        </AdminCard>

        <AdminCard title="Excessive Activity Creation">
          <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginBottom: 8 }}>5 or more activities created by the same organizer in the last 24 hours — a plain, stated threshold, not a weighted risk score.</div>
          {data.excessiveCreators.length === 0 ? <EmptyState message="No organizers currently stand out." /> : data.excessiveCreators.map((c) => (
            <Row key={c.id} left={<a href={`/admin/users/${c.id}`} style={linkStyle}>{c.name} <span style={{ color: COLORS.textFaint }}>@{c.handle}</span></a>} right={`${c.count} activities in 24h`} />
          ))}
        </AdminCard>
      </div>
    </>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: `1px solid ${COLORS.borderLight}`, fontSize: 13 }}>
      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{left}</div>
      <div style={{ flexShrink: 0, fontSize: 12, color: COLORS.textFaint }}>{right}</div>
    </div>
  );
}
const linkStyle: React.CSSProperties = { color: COLORS.ink, fontWeight: 600, textDecoration: 'none' };
