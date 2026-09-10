'use client';

import { useEffect, useState } from 'react';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminCard from '@/components/admin/AdminCard';
import LoadingState from '@/components/LoadingState';
import { COLORS, RADIUS } from '@/lib/designTokens';

type SystemStatus = {
  database: { status: 'up' | 'down'; latencyMs: number };
  storage: { status: 'not_monitored' };
  realtime: { status: 'not_monitored' };
  api: { status: 'not_monitored' };
};

export default function AdminSystemPage() {
  const [data, setData] = useState<SystemStatus | null>(null);

  useEffect(() => {
    fetch('/api/admin/system').then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <LoadingState />;

  return (
    <>
      <AdminHeader title="System" subtitle="Platform health" />
      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <StatusCard label="Database" status="up" detail={`${data.database.latencyMs}ms response time`} real />
        <StatusCard label="Storage" status="not_monitored" detail="No monitoring wired up yet — see TODO in the API route" />
        <StatusCard label="Realtime" status="not_monitored" detail="No monitoring wired up yet — see TODO in the API route" />
        <StatusCard label="API" status="not_monitored" detail="For a Vercel-hosted app, check vercel-status.com directly" />
      </div>
    </>
  );
}

function StatusCard({ label, status, detail, real }: { label: string; status: 'up' | 'down' | 'not_monitored'; detail: string; real?: boolean }) {
  const dotColor = status === 'up' ? COLORS.success : status === 'down' ? COLORS.danger : COLORS.textFaint;
  return (
    <AdminCard>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink }}>{label}</div>
        {!real && (
          <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.textFaint, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '1px 6px', marginLeft: 'auto' }}>
            NOT MONITORED
          </span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{detail}</div>
    </AdminCard>
  );
}
