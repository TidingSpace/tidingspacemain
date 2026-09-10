'use client';

import posthog from 'posthog-js';

// True only once, after init() actually runs — every call before that
// (or when no API key is configured at all, e.g. local dev) is a silent
// no-op rather than an error. Analytics must never be able to break the
// app it's trying to measure.
let initialized = false;

export function initAnalytics() {
  if (initialized || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // no key configured — stays inert, never throws

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    // Page views are tracked manually via the one app_opened event this
    // app actually wants (see AppOpenedTracker), not PostHog's own
    // automatic pageview/pageleave capture — the task's event list is
    // deliberately small, and autocapture would silently work against
    // that by tracking far more than the ten named events.
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    // Never block rendering or user interaction on a network call —
    // PostHog's JS client already batches and sends in the background
    // by default; this just makes that intent explicit.
    loaded: (ph) => {
      if (process.env.NODE_ENV === 'development') ph.debug(false);
    }
  });
  initialized = true;
}

// Associates all future events (this session and later ones, since
// PostHog persists distinct_id in localStorage) with a stable user ID —
// required for retention analysis to work at all, since "did this same
// person come back" needs a consistent identity across visits. Only the
// ID is sent, deliberately never email or name (see the privacy notes in
// ANALYTICS.md) — a UUID alone isn't meaningful outside this system.
export function identifyUser(userId: string) {
  if (!initialized) return;
  posthog.identify(userId);
}

export function resetAnalyticsIdentity() {
  if (!initialized) return;
  posthog.reset();
}

// The one function every event-tracking call site actually uses.
// Deliberately swallows every possible failure — a missing key, a
// network error, PostHog being down entirely — none of it should ever
// surface to the person using the app or block whatever real action
// they just took. This is genuinely fire-and-forget: callers never await
// this and never check a return value.
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics failing is not the app's problem — silently drop it.
  }
}
