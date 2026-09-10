import { COLORS, RADIUS } from '@/lib/designTokens';

export default function SearchToolbar({
  value,
  onChange,
  placeholder = 'Search…',
  filters,
  activeFilter,
  onFilterChange
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  filters?: { key: string; label: string }[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '9px 12px 9px 34px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
            fontSize: 13.5, color: COLORS.ink, boxSizing: 'border-box', outline: 'none'
          }}
        />
      </div>
      {filters && filters.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => onFilterChange?.(f.key)}
              style={{
                padding: '7px 13px', borderRadius: RADIUS.pill, border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                background: activeFilter === f.key ? COLORS.violet : COLORS.surfaceAlt,
                color: activeFilter === f.key ? '#fff' : COLORS.textSecondary
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
