import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';

export default function StatCard({ label, value, icon, hint }: { label: string; value: string | number; icon?: React.ReactNode; hint?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: 18, boxShadow: SHADOW.card }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.textSecondary }}>{label}</span>
        {icon && <div style={{ width: 30, height: 30, borderRadius: RADIUS.sm, background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.ink }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
