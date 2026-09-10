import { COLORS, RADIUS, FONT } from '@/lib/designTokens';
import { type ActivityTimeState, formatCountdown } from '@/lib/activityTimeState';

// The one badge component every screen uses for activity urgency — Explore's
// Activity Details sheet, ActivityPostCard (Feed/Post Detail), Search,
// Profile, Saved. Map pins are the one exception (they're raw DOM elements
// built imperatively by Mapbox, not React) but pull their halo colors from
// the same states and the same globals.css animation classes this renders with.
//
// `now` is a required prop, not read internally via `new Date()` — this is
// deliberate. It keeps this component pure and forces every caller to be
// explicit about which clock it's using: list views pass the shared,
// low-frequency tick from useTimeStateTick(), while the Activity Details
// sheet passes its own per-second tick from useLiveCountdown(). Neither
// has to guess what the other is doing.
export default function ActivityTimeBadge({
  state,
  startsAt,
  now,
  context = 'compact'
}: {
  state: ActivityTimeState;
  startsAt: string;
  now: Date;
  // 'compact': cards, search results, list rows — short label ("LIVE").
  // 'detail': the Activity Details sheet — fuller label ("Happening now").
  context?: 'compact' | 'detail';
}) {
  const content = badgeContent(state, startsAt, now, context);
  if (!content) return null;

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: RADIUS.pill,
        fontSize: FONT.caption.fontSize, fontWeight: 700, lineHeight: 1.3,
        color: content.color, background: content.background,
        whiteSpace: 'nowrap'
      }}
    >
      {content.dot && (
        <span
          style={{ width: 6, height: 6, borderRadius: '50%', background: content.color, flexShrink: 0 }}
        />
      )}
      {content.label}
    </span>
  );
}

function badgeContent(
  state: ActivityTimeState,
  startsAt: string,
  now: Date,
  context: 'compact' | 'detail'
): { label: string; color: string; background: string; dot?: boolean } | null {
  switch (state) {
    case 'upcoming':
    case 'starting_soon':
      // Starting Soon gets no badge at all — matching "slight visual
      // emphasis only... no badge" from the original spec. (It briefly had
      // a breathing-glow animation on the card border; animations across
      // this whole system were removed per later product direction.)
      return null;

    case 'soon': {
      const isTomorrow = new Date(startsAt).toDateString() === new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString();
      return { label: isTomorrow ? 'Tomorrow' : 'Soon', color: COLORS.violetDeep, background: COLORS.violetTint };
    }

    case 'starting_very_soon': {
      const minutes = Math.max(1, Math.round((new Date(startsAt).getTime() - now.getTime()) / 60000));
      return { label: `Starts in ${minutes} min`, color: COLORS.violetDeep, background: COLORS.violetTint };
    }

    case 'starting_now':
      return { label: 'Starting now', color: '#fff', background: COLORS.violet };

    case 'in_progress':
      return {
        label: context === 'detail' ? 'Happening now' : 'LIVE',
        color: COLORS.success, background: `${COLORS.success}1A`,
        dot: true
      };

    case 'ending_soon':
      return { label: 'Ending soon', color: '#B8600F', background: '#FDEEDD' };

    case 'finished':
      return null;

    default:
      return null;
  }
}

// Exposed separately so the Activity Details sheet can show a live,
// per-second countdown ("Starts in 24 min" -> "Starts in 09:42") instead of
// this badge's minute-granularity text, once starting_very_soon/starting_now
// is reached — without needing its own copy of the "Starts in" phrasing.
export function countdownLabel(startsAt: string, now: Date): string {
  return `Starts in ${formatCountdown(startsAt, now)}`;
}
