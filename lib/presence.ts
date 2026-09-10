// Single source of truth for "is this person online right now."
//
// Approach: heartbeat + threshold, not a live WebSocket presence channel.
// While the app is open, the current user's profile gets a last_seen_at
// timestamp refreshed periodically (see components/PresenceHeartbeat.tsx).
// Anyone is considered "online" if their last_seen_at is within
// ONLINE_THRESHOLD_MS of now — a simple, common pattern (similar to how
// many chat apps show "online" vs "last seen"), rather than a real-time
// presence socket, which would need active subscriptions per person shown
// and is a meaningfully bigger piece of infrastructure than this app needs
// for a green/grey dot.
//
// Pure file, no React import — this needs to be importable from server-side
// API routes (to compute isOnline before sending data to the client) as
// well as client components, and mixing in a hook here would break that the
// same way it once did for lib/activityTimeState.ts.

// Comfortably longer than HEARTBEAT_INTERVAL_MS (see PresenceHeartbeat) so a
// genuinely active user's dot never flickers to grey between heartbeats.
export const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;

export function isOnline(lastSeenAt: string | null, now: Date = new Date()): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}
