import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// DELIBERATE, NARROW EXCEPTION to this project's "no service-role key
// anywhere" rule. Every other route in this app uses lib/supabase-server.ts,
// which reads the caller's own session cookie and is subject to RLS like
// any other authenticated request — that's what makes RLS the actual
// security boundary everywhere else.
//
// This client bypasses RLS entirely. There are three legitimate reasons
// this app needs that:
// 1. Deleting a user's own auth.users row (supabase.auth.admin.deleteUser)
//    has no RLS-respecting equivalent — the regular client SDK has no
//    "delete my own account" method at all, because auth.users isn't a
//    table your own session can act on the way it can on profiles or posts.
// 2. Scheduled maintenance jobs (e.g. the rate_limit_log cleanup cron) have
//    no logged-in user at all — there's no auth.uid() for RLS to check
//    against when the job needs to act across every user's rows at once.
// 3. The admin panel needs to read OTHER people's email addresses (for
//    user search/detail) — email lives in auth.users, not profiles, and
//    there's no RLS-respecting way to read someone else's auth.users row
//    even as a verified admin. This case is genuinely different from 1 and
//    2: it acts on someone else's data on purpose, not the caller's own —
//    the safety guarantee here is entirely "is the caller actually an
//    admin" (requireAdmin(), checked BEFORE this client is touched), not
//    "is this the caller's own id."
//
// Rules for using this file:
// - Only ever call it from a server-only API route, never a Client Component.
// - For anything acting on a specific user's OWN data: verify the caller's
//   own identity with the normal cookie-based client (lib/supabase-server.ts's
//   auth.getUser()) BEFORE using this one, and only ever act on that
//   verified user's own id — never on an id taken from the request body or params.
// - For scheduled jobs with no logged-in user at all: verify the request is
//   genuinely the scheduler (e.g. comparing an Authorization header against
//   CRON_SECRET) before doing anything, since there's no session to check instead.
// - For admin-panel routes acting on OTHER people's data: call requireAdmin()
//   (lib/adminAuth.ts) FIRST and return its error immediately if it's not an
//   admin — only then touch this client, and only for the specific lookup
//   the route needs (e.g. one user's email by id), not a broad, unscoped dump.
// - Requires SUPABASE_SERVICE_ROLE_KEY to be set as a server-only
//   environment variable (never NEXT_PUBLIC_-prefixed, never sent to the
//   browser). Get it from Supabase's dashboard: Settings -> API -> service_role key.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
