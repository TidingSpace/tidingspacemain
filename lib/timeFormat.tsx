'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-browser';

// ============================================================
// Single source of truth for "does this person want 12-hour or 24-hour
// time." Fetched once per session (not once per component), exposed via
// context, and read through useTimeFormat() anywhere a time gets displayed
// — the same "one source of truth, no scattered conditionals" approach
// already used for activity urgency state.
// ============================================================

type TimeFormatContextValue = {
  use24h: boolean;
  loaded: boolean;
  // Updates both the live value (so every screen re-renders immediately)
  // and persists it to the profile — callers don't need to do both themselves.
  setUse24h: (value: boolean) => Promise<void>;
  formatTime: (date: Date | string) => string;
};

const TimeFormatContext = createContext<TimeFormatContextValue | null>(null);

/**
 * Pure formatting function — takes the preference as an explicit argument
 * rather than reading context internally, so it stays usable from anywhere
 * (including non-component code) and stays trivially testable.
 */
export function formatTimeWithPreference(date: Date | string, use24h: boolean): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (use24h) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  // Same "omit :00 for round hours" behavior as before, but with hour12
  // explicitly forced — this is the exact bug just fixed for the map pin
  // label, applied consistently everywhere time gets shown.
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, hour12: true });
}

export function TimeFormatProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [use24h, setUse24hState] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoaded(true); return; }
      const { data } = await supabase.from('profiles').select('time_format_24h').eq('id', user.id).maybeSingle();
      if (!cancelled) {
        setUse24hState(!!data?.time_format_24h);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setUse24h = useCallback(async (value: boolean) => {
    setUse24hState(value); // optimistic — every consumer re-renders immediately
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const res = await fetch(`/api/profiles/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_format_24h: value })
    });
    if (!res.ok) setUse24hState(!value); // revert on failure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = useCallback((date: Date | string) => formatTimeWithPreference(date, use24h), [use24h]);

  // Every individual value here was already stable (formatTime/setUse24h
  // are both useCallback'd above), but the wrapping object itself was a
  // fresh literal on every render — meaning every consumer of this
  // context, anywhere in the app, re-rendered whenever this provider
  // re-rendered for any reason, even when none of these values actually
  // changed. useMemo is what actually stops that: same object reference
  // across renders unless one of the real dependencies changes.
  const value = useMemo(() => ({ use24h, loaded, setUse24h, formatTime }), [use24h, loaded, setUse24h, formatTime]);

  return (
    <TimeFormatContext.Provider value={value}>
      {children}
    </TimeFormatContext.Provider>
  );
}

export function useTimeFormat(): TimeFormatContextValue {
  const ctx = useContext(TimeFormatContext);
  if (!ctx) {
    // Defensive fallback rather than throw — a screen that forgets this
    // provider still works (defaults to 12-hour), just without the shared
    // preference; better than a hard crash for a formatting nicety.
    return { use24h: false, loaded: true, setUse24h: async () => {}, formatTime: (d) => formatTimeWithPreference(d, false) };
  }
  return ctx;
}
