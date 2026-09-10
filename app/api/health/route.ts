import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// Without this, Next.js could statically cache this route's response at
// build time — which would defeat the entire point of a health check,
// since it needs to reflect the app's actual live state on every request,
// not a frozen snapshot from whenever it was last deployed.
export const dynamic = 'force-dynamic';

// GET /api/health — a minimal, public, unauthenticated liveness check for
// external uptime monitoring. Deliberately does the smallest possible
// amount of real work: one trivial query, just enough to confirm the app
// can actually reach its database, not just that Next.js itself is
// running. No secrets, no credentials, no user data, no expensive joins
// or aggregates — this is designed to be hit every minute or so by an
// external monitor without adding any meaningful load.
export async function GET() {
  try {
    const supabase = createClient();
    // count-only, head request — no rows returned, no user data touched.
    // categories is a small, fixed table (an admin-curated list), about
    // as cheap a real round-trip to the database as this app has.
    const { error } = await supabase.from('categories').select('*', { count: 'exact', head: true });

    if (error) {
      return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503 });
    }
    return NextResponse.json({ status: 'ok', database: 'reachable', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 });
  }
}
