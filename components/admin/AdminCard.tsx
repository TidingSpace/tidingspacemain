import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

export default function AdminCard({ title, actions, children }: { title?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, boxShadow: SHADOW.card, padding: 20 }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          {title && <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{title}</div>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
