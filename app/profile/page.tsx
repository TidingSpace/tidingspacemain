'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function MyProfileRedirect() {
  useEffect(() => {
    // Guards against React Strict Mode's dev-only double-invocation of
    // effects (mount -> cleanup -> mount again). Without this, two
    // near-simultaneous getUser() calls can race against Supabase's
    // refresh-token rotation — if one call triggers a token refresh, the
    // other can read an inconsistent session and see "no user" even though
    // a valid session existed a moment earlier, causing this to redirect to
    // /login as if the session had disappeared. Only the final invocation's
    // result is ever acted on now; the superseded one's callback checks
    // `cancelled` and no-ops instead of redirecting anywhere.
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) window.location.href = `/profile/${data.user.id}`;
      else window.location.href = '/login';
    });
    return () => { cancelled = true; };
  }, []);

  return <div style={{ padding: 40, color: '#716C87' }}>Loading your profile…</div>;
}
