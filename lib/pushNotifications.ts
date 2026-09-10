import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase-admin';

// VAPID keys authenticate this server to push services (Apple/Google/etc.)
// as the legitimate sender for its own subscriptions — this is a one-time
// setup requirement of the Web Push standard itself, not something
// specific to this app. Generated once with web-push's own keygen; the
// public half is also used client-side (NEXT_PUBLIC_VAPID_PUBLIC_KEY) when
// actually creating a subscription.
if (process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    'mailto:support@tidingspace.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Sends a push notification to every device a user has subscribed on.
// Silently does nothing if VAPID keys aren't configured (e.g. local dev
// without them set) or the user has no subscriptions — this is
// deliberately best-effort and must never throw in a way that could break
// the actual message-send request it's called from.
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url: string; tag?: string }
) {
  await sendPushToUserVerbose(userId, payload);
}

// Same underlying send logic, but returns exactly what happened for each
// subscription instead of silently swallowing everything — used by the
// "Send Test Notification" diagnostic in Settings, where the whole point
// is seeing precisely which link in the chain is broken (no VAPID keys
// configured, no subscriptions on file, or the push provider itself
// rejecting the send and why) rather than a real message's fire-and-forget
// send needing to stay silent no matter what.
//
// Uses the admin client internally, not a client passed in by the caller.
// push_subscriptions' RLS correctly only allows a user to read their own
// subscriptions — which is exactly right for the person managing their own
// push settings, but wrong for this function's actual job: looking up
// *someone else's* (the recipient's) subscriptions to deliver a message
// notification to them. A caller-supplied client tied to the sender's own
// session would have that lookup silently filtered to zero rows by RLS —
// no error, just nothing found, which is exactly what was happening before
// this fix. Authorization isn't weakened by using the admin client here:
// every call site already verifies the recipient is a legitimate one for
// that specific message BEFORE reaching this function (the DM insert's own
// RLS constrains who a message can even be sent to; group/activity chat
// compute recipient lists from verified active membership or confirmed
// RSVP/organizer status) — this function was never the authorization
// boundary, it's the delivery step for a decision already made upstream.
// Scoped narrowly: this client is used only for push_subscriptions reads
// and dead-subscription cleanup, nowhere else in this file or exported
// from it — matching this project's existing, documented pattern for
// service-role usage (see lib/supabase-admin.ts).
export async function sendPushToUserVerbose(
  userId: string,
  payload: { title: string; body: string; url: string; tag?: string }
): Promise<{ vapidConfigured: boolean; subscriptionCount: number; results: { endpoint: string; success: boolean; error?: string }[] }> {
  const vapidConfigured = !!(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  if (!vapidConfigured) return { vapidConfigured: false, subscriptionCount: 0, results: [] };

  const supabase = createAdminClient();
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subscriptions || subscriptions.length === 0) {
    return { vapidConfigured: true, subscriptionCount: 0, results: [] };
  }

  const results = await Promise.all(
    subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        return { endpoint: sub.endpoint, success: true };
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else {
          console.error('[sendPushToUserVerbose] push failed:', err?.message ?? err);
        }
        return { endpoint: sub.endpoint, success: false, error: `${err?.statusCode ?? '?'}: ${err?.message ?? err}` };
      }
    })
  );

  return { vapidConfigured: true, subscriptionCount: subscriptions.length, results };
}
