// Client-side Sentry init. This app runs Next.js 14.2.35, which predates
// Next's own native instrumentation-client.ts convention (added in Next
// 15.3, April 2025) — so this uses Sentry's own, established pattern for
// this Next version instead: a plain config file, automatically picked up
// and injected by the withSentryConfig wrapper in next.config.js.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // A modest, non-zero sample rate — enough to see real performance data
  // without tracing every single request, which adds up in both Sentry
  // quota and (very slightly) client overhead. Adjust freely once real
  // traffic volume is known.
  tracesSampleRate: 0.1,
  // Silently does nothing at all if the DSN isn't set (e.g. local dev
  // without it configured) — never throws, never blocks the app from
  // working just because monitoring isn't wired up yet in this environment.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN
});
