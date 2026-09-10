'use client';

import CategoryIcon from '@/components/CategoryIcon';
import { COLORS, RADIUS } from '@/lib/designTokens';

type AttendedActivity = { id: string; title: string; category: string; starts_at: string; status: string };

export default function AttendedActivitiesSheet({
  activities,
  onClose
}: {
  activities: AttendedActivity[];
  onClose: () => void;
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px 20px', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 16px auto', flexShrink: 0 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.ink, marginBottom: 14, flexShrink: 0 }}>Activities</div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {activities.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {activities.map((a) => (
                <a
                  key={a.id}
                  href={`/?activity=${a.id}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: RADIUS.md, background: COLORS.violetTint,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: a.status === 'cancelled' ? 0.5 : 1
                  }}>
                    <CategoryIcon categoryKey={a.category} size={26} />
                  </div>
                  <div style={{ fontSize: 10.5, color: COLORS.textSecondary, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', width: '100%' }}>
                    {a.title}
                  </div>
                </a>
              ))}
            </div>
          )}
          {activities.length === 0 && (
            <p style={{ fontSize: 13, color: COLORS.textFaint, textAlign: 'center', padding: '20px 0' }}>No activities attended yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
