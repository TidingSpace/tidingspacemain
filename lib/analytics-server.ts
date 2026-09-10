import { PostHog } from 'posthog-node';

// Most of this app's required events fire from API routes, not the
// browser — activity_created, activity_joined, group_created,
// message_sent, and report_submitted all happen server-side, at the
// moment the underlying database write actually succeeds. This is the
// server-side counterpart to lib/analytics-client.ts.
//
// A fresh client per call rather than one shared instance — this app
// runs on Vercel's serverless functions, which can terminate immediately
// after a response is sent. posthog-node normally batches events in the
// background over time, which works fine on a long-running server but
// risks silently dropping events here if the function instance is
// frozen or recycled before the batch flushes. flushAt: 1 sends
// immediately instead of batching, and the explicit shutdown() call
// below guarantees the request actually completes before this function
// returns — the standard, documented pattern for posthog-node in
// serverless environments specifically.
export async function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const key = process.env.POSTHOG_KEY;
  if (!key) return; // no key configured — inert, never throws

  try {
    const client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0
    });
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch {
    // Deliberately swallowed — analytics failing must never surface as
    // an error on the real action (creating an activity, sending a
    // message, etc.) that triggered this call. Every call site treats
    // this as fire-and-forget and never awaits or checks it in a way
    // that could affect the actual response.
  }
}
