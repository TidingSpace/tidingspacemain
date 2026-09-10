import type { SupabaseClient } from '@supabase/supabase-js';

// Minimal rate limiting backed by the existing Postgres database — no new
// external service. Checks how many times this user has taken this action
// within the given time window; if under the limit, records this attempt and
// allows it, otherwise rejects without recording (a rejected attempt
// shouldn't count against the next real one).
//
// Known limitation, intentionally not solved here: rate_limit_log has no
// cleanup job, so it grows indefinitely. Fine at closed-beta scale (this is
// a handful of rows per user per action); would want a periodic delete of
// old rows (or a scheduled job) before this matters at real scale. No
// scheduled-job infrastructure exists anywhere in this app yet, consistent
// with earlier decisions in this project — not introduced here either.
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  maxCount: number,
  windowSeconds: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count } = await supabase
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStart);

  if ((count ?? 0) >= maxCount) return false;

  await supabase.from('rate_limit_log').insert({ user_id: userId, action });
  return true;
}
