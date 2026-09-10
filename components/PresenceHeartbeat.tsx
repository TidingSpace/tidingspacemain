'use client';

import { useEffect } from 'react';

// Comfortably shorter than ONLINE_THRESHOLD_MS in lib/presence.ts, so a
// genuinely active user's last_seen_at never goes stale enough to look
// offline between beats.
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

// Mounted once, at the app root — pings the server on load and then every
// 60s for as long as the tab stays open. Does nothing with the response;
// this is fire-and-forget by design, since a single missed heartbeat just
// means the next one (a minute later) catches things back up, not a real
// failure worth surfacing to anyone.
export default function PresenceHeartbeat() {
  useEffect(() => {
    const beat = () => { fetch('/api/presence/heartbeat', { method: 'POST' }).catch(() => {}); };
    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
