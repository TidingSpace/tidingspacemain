// Next.js calls register() once at server startup, before handling any
// requests. NEXT_RUNTIME tells us which of the two server-side runtimes
// we're actually in — 'nodejs' for normal API routes/server components,
// 'edge' for middleware.ts specifically — so the right Sentry config
// loads for each rather than assuming one environment for both.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
