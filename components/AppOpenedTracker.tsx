'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { initAnalytics, identifyUser, trackEvent } from '@/lib/analytics-client';

// Mounted once at the root, alongside PresenceHeartbeat — same pattern,
// null-rendering, runs once per app load.
//
// app_opened only fires for AUTHENTICATED sessions, and only once per
// browser session (sessionStorage-gated, not once per page navigation —
// this app is a single-page-feeling PWA where switching tabs shouldn't
// count as a fresh "open"). Anonymous visits to the login page aren't
// tracked as app_opened at all: the retention question this event exists
// to answer ("do users return after their first session") only makes
// sense for people who've actually signed up, and conflating "hit the
// login page" with "opened the app" would blur that signal rather than
// clarify it.
export default function AppOpenedTracker() {
  useEffect(() => {
    initAnalytics();

    const alreadyTrackedThisSession = window.sessionStorage.getItem('ts_app_opened_tracked');
    if (alreadyTrackedThisSession) return;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return; // anonymous — deliberately not tracked, see note above
      identifyUser(data.user.id);
      trackEvent('app_opened');
      window.sessionStorage.setItem('ts_app_opened_tracked', '1');
    }).catch(() => {});
  }, []);

  return null;
}
