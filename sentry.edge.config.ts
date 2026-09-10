// Edge runtime Sentry init — this app's middleware.ts (maintenance mode
// checks) runs in the edge runtime, which is a separate, more restricted
// environment from the Node.js server runtime, and needs its own init.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.SENTRY_DSN
});
