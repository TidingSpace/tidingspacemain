import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

// GET /api/cron/cleanup-rate-limit-log — deletes rate_limit_log rows older
// than 24 hours. Runs on a schedule via Vercel Cron (see vercel.json), not
// triggered by any user action.
//
// Why 24 hours: the longest actual rate-limit window in use anywhere in
// this app is 1 hour (reports, 5/hour) — checkRateLimit() only ever looks
// at "the last N seconds" of a given window, so a row older than that
// window can never affect a real rate-limit decision again. 24 hours gives
// a full day of safety margin beyond the longest window, not a tight
// cutoff riding right against it.
//
// Why this needs the admin client: rate_limit_log's RLS policies (select/
// insert, both scoped to auth.uid() = user_id) have no delete policy at
// all, and a scheduled job has no logged-in user in the first place — there's
// no auth.uid() to scope by when cleaning up rows across every user at
// once. This reuses the same narrow, documented admin-client exception
// already established for account deletion, rather than introducing a
// second one.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await admin
    .from('rate_limit_log')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    console.error('[/api/cron/cleanup-rate-limit-log]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ deleted: count ?? 0 });
}
