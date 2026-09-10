'use client';

import { useEffect, useState } from 'react';
import { formatCountdown } from '@/lib/activityTimeState';

// Split out from lib/activityTimeState.ts specifically because that file
// needs to be importable from server-side API routes (for
// DEFAULT_ACTIVITY_DURATION_MS and getEffectiveEndTime) — a file containing
// useEffect/useState can't be imported into a Server Component or route
// handler at all, even just for an unrelated constant, so the pure
// functions and these hooks can't share a file anymore. This file is the
// client-only half; lib/activityTimeState.ts is the pure half.

// ------------------------------------------------------------
// useTimeStateTick — ONE shared, low-frequency re-render trigger for list
// views (map, Feed, Search, Profile, Saved). Deliberately NOT per-second:
// with hundreds of activities on screen, a per-item or per-second timer
// would mean hundreds of intervals firing every second for no visible
// benefit — these states change in windows of minutes to hours, so a
// shared 30-second tick is imperceptibly different from "instant" while
// costing almost nothing. Call this ONCE per page/list, not once per card;
// every card on that page re-renders together off the same tick and
// recomputes its own state via the pure function in activityTimeState.ts.
// ------------------------------------------------------------
export function useTimeStateTick(intervalMs: number = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ------------------------------------------------------------
// useLiveCountdown — the ONE place in the whole app allowed to tick every
// second. Scoped locally to whatever component calls it (the Activity
// Details sheet); the interval is created and torn down with that
// component's own mount/unmount, so it only ever runs while the sheet is
// actually open, and never affects any other screen's render frequency.
// ------------------------------------------------------------
export function useLiveCountdown(targetIso: string, active: boolean): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [active, targetIso]);
  return formatCountdown(targetIso, now);
}
