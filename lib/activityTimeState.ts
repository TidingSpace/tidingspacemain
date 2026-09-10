// ============================================================
// Single source of truth for "how urgent is this activity right now."
// Every screen that shows an activity (Explore map, ActivityPostCard,
// Search, Profile, Saved, the Activity Details sheet) computes its state
// through getActivityTimeState() and renders it through <ActivityTimeBadge>.
// Nothing should hand-roll its own "is this starting soon" check.
// ============================================================

export type ActivityTimeState =
  | 'upcoming'              // > 24h before start
  | 'soon'                  // 24h - 2h before start
  | 'starting_soon'         // 2h - 30min before start
  | 'starting_very_soon'    // 30min - 10min before start
  | 'starting_now'          // 10min - 0min before start
  | 'in_progress'           // started, not ending soon (covers both "LIVE" and "Happening now" copy — same state, different label per context)
  | 'ending_soon'           // started, <30min left before end
  | 'finished';             // ends_at has passed

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// Activities without an explicit end time use a computed default duration
// to avoid remaining LIVE indefinitely.
// The one default duration used everywhere an activity has no explicit end
// time — defined once so it's never a magic number re-typed in multiple
// places (the map's SQL-level filter and this file's own state computation
// both reference this same constant).
export const DEFAULT_ACTIVITY_DURATION_MS = 2 * HOUR;

/**
 * The end time this activity behaves as if it has, for every piece of
 * system logic (LIVE status, disappearing from the map, "ending soon") —
 * NOT necessarily what's displayed to a user as "the end time," since an
 * organizer who left it blank never entered one and the UI should keep
 * saying so. This is purely an internal computation: explicit ends_at wins
 * when set; otherwise starts_at + DEFAULT_ACTIVITY_DURATION_MS.
 *
 * This is also what makes the whole system backward-compatible with zero
 * migration: an old activity with ends_at = null automatically gets a
 * sensible computed end the moment this function runs, without anyone
 * having to backfill a real value into the database.
 */
export function getEffectiveEndTime(startsAt: string, endsAt: string | null): Date {
  if (endsAt) return new Date(endsAt);
  return new Date(new Date(startsAt).getTime() + DEFAULT_ACTIVITY_DURATION_MS);
}

/**
 * Pure function — no side effects, no clock of its own. Pass `now` explicitly
 * so this stays trivially testable and so callers control exactly how often
 * it's recomputed, rather than this function silently reading Date.now() on
 * every call and making that decision for them.
 *
 * endsAt is nullable (matches the schema — not every activity has an end
 * time set explicitly). Without one, this no longer means "never ends" —
 * getEffectiveEndTime() supplies a computed default (start + 2h), so an
 * activity without an explicit end time still correctly moves through
 * ending_soon and finished instead of staying "in_progress"/LIVE forever.
 * This was a deliberate change from this function's earlier behavior,
 * made specifically because activities were staying LIVE indefinitely.
 */
export function getActivityTimeState(startsAt: string, endsAt: string | null, now: Date = new Date()): ActivityTimeState {
  const start = new Date(startsAt).getTime();
  const end = getEffectiveEndTime(startsAt, endsAt).getTime();
  const t = now.getTime();

  if (t > end) return 'finished';

  if (t >= start) {
    // Started.
    if (end - t <= 30 * MIN) return 'ending_soon';
    return 'in_progress';
  }

  // Not yet started.
  const msUntilStart = start - t;
  if (msUntilStart <= 10 * MIN) return 'starting_now';
  if (msUntilStart <= 30 * MIN) return 'starting_very_soon';
  if (msUntilStart <= 2 * HOUR) return 'starting_soon';
  if (msUntilStart <= 24 * HOUR) return 'soon';
  return 'upcoming';
}

/**
 * Formats a live countdown like "24 min" or "09:42" for the minutes/seconds
 * remaining until `target`. Only ever used by the Activity Details sheet's
 * per-second countdown — list views should never need sub-minute precision.
 */
export function formatCountdown(targetIso: string, now: Date = new Date()): string {
  const diffMs = new Date(targetIso).getTime() - now.getTime();
  const totalSeconds = Math.max(0, Math.round(diffMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 10) return `${minutes} min`;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// The two hooks that used to live here (useTimeStateTick, useLiveCountdown)
// moved to lib/activityTimeStateHooks.ts — they use useEffect/useState,
// which meant this file couldn't be imported from a server-side API route
// even just for DEFAULT_ACTIVITY_DURATION_MS. Everything below is pure
// (no React dependency), safe to import from server or client code alike.

