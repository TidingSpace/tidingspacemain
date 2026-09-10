'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import AdminHeader from '@/components/admin/AdminHeader';
import LoadingState from '@/components/LoadingState';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';
import type { AdminMapActivity } from '@/components/admin/AdminLiveMap';

const AdminLiveMap = dynamic(() => import('@/components/admin/AdminLiveMap'), {
  ssr: false,
  loading: () => <LoadingState />
});

export default function AdminMapPage() {
  const [activities, setActivities] = useState<AdminMapActivity[] | null>(null);
  const [showFinished, setShowFinished] = useState(false);

  useEffect(() => {
    fetch('/api/admin/map').then((r) => r.json()).then((json) => setActivities(json.activities ?? []));
  }, []);

  // Stabilized with useCallback — this was previously a fresh inline
  // function created on every render of this page, which meant
  // AdminLiveMap's marker-creation effect (which depends on this
  // reference) would tear down and recreate every marker far more often
  // than necessary, on every re-render of this page for any reason at all.
  // Found and fixed during continued investigation of the marker-drift
  // bug — not confirmed to be its root cause, but a real, verified
  // inefficiency worth fixing regardless.
  const handleSelectActivity = useCallback((a: AdminMapActivity) => {
    window.location.href = `/admin/activities/${a.id}`;
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <AdminHeader
        title="Live Map"
        subtitle="What's happening on the platform right now"
        actions={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={showFinished} onChange={(e) => setShowFinished(e.target.checked)} />
            Show finished
          </label>
        }
      />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {activities === null ? (
          <LoadingState />
        ) : (
          <AdminLiveMap
            activities={activities}
            showFinished={showFinished}
            onSelectActivity={handleSelectActivity}
          />
        )}

        <div style={{
          position: 'absolute', bottom: 20, left: 20, background: '#fff', borderRadius: RADIUS.lg,
          boxShadow: SHADOW.raised, padding: 14, fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 7
        }}>
          <LegendRow color={COLORS.violet} label="Upcoming" />
          <LegendRow color={COLORS.success} label="Live" />
          <LegendRow color="#B8600F" label="Cancelled" />
          <LegendRow color={COLORS.textFaint} label="Hidden / Finished" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${COLORS.danger}` }} />
            <span>Reported</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: COLORS.violetDeep }} />
            <span>Recurring</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
      <span>{label}</span>
    </div>
  );
}
