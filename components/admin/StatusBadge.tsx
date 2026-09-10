import { COLORS, RADIUS } from '@/lib/designTokens';

// One shared badge for every status word across the admin panel — activity
// status, report status, account status — so "active" always looks like
// the same green pill everywhere, rather than each page inventing its own.
const TONE_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: `${COLORS.success}1A`, color: COLORS.success },
  live: { bg: `${COLORS.success}1A`, color: COLORS.success },
  upcoming: { bg: COLORS.violetTint, color: COLORS.violetDeep },
  finished: { bg: COLORS.surfaceAlt, color: COLORS.textFaint },
  completed: { bg: COLORS.surfaceAlt, color: COLORS.textFaint },
  cancelled: { bg: '#FDEEDD', color: '#B8600F' },
  hidden: { bg: '#F1ECFB', color: COLORS.textSecondary },
  open: { bg: '#FDEEDD', color: '#B8600F' },
  reviewed: { bg: `${COLORS.success}1A`, color: COLORS.success },
  dismissed: { bg: COLORS.surfaceAlt, color: COLORS.textFaint },
  suspended: { bg: '#FDEEDD', color: '#B8600F' },
  banned: { bg: `${COLORS.danger}1A`, color: COLORS.danger }
};

export default function StatusBadge({ status }: { status: string }) {
  const tone = TONE_COLORS[status] ?? { bg: COLORS.surfaceAlt, color: COLORS.textSecondary };
  return (
    <span style={{
      display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '3px 10px',
      borderRadius: RADIUS.pill, background: tone.bg, color: tone.color, textTransform: 'capitalize', whiteSpace: 'nowrap'
    }}>
      {status}
    </span>
  );
}
