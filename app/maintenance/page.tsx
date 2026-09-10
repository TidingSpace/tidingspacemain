import { COLORS } from '@/lib/designTokens';

// Shown to non-admin users when Maintenance Mode is on (see middleware.ts).
// Deliberately simple and static — no data fetching, no client interactivity
// needed for a page whose only job is "explain the app is unavailable."
export default function MaintenancePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 32, textAlign: 'center', background: '#FBFAFF'
    }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.ink, margin: '0 0 8px 0' }}>
        Tiding Space is temporarily unavailable
      </h1>
      <p style={{ fontSize: 14.5, color: COLORS.textSecondary, maxWidth: 340, lineHeight: 1.5, margin: 0 }}>
        We're doing some quick maintenance behind the scenes. Please check back shortly — this shouldn't take long.
      </p>
    </div>
  );
}
