import { COLORS } from '@/lib/designTokens';

export default function AdminHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 28px', borderBottom: `1px solid ${COLORS.border}`, background: '#fff',
      position: 'sticky', top: 0, zIndex: 5
    }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}
