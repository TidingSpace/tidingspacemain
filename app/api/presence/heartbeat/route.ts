import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// POST /api/presence/heartbeat — stamps the caller's own last_seen_at to
// now. Called periodically by components/PresenceHeartbeat while the app
// is open; nobody else's row can be touched, since this always acts on the
// caller's own session, never an id from the request.
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.error('[/api/presence/heartbeat]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
