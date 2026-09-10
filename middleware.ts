import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getMaintenanceMode } from '@/lib/maintenanceModeCache';

// Paths that must stay reachable even when Maintenance Mode is on:
// - /maintenance itself (otherwise nothing could ever show it)
// - /login, /reset-password, /auth/callback — an admin who isn't already
//   logged in still needs a way to authenticate during maintenance;
//   blocking these would make the admin bypass impossible to use
// - /admin and everything under it — admins need full access, including
//   to the admin panel that lets them turn maintenance mode back off
// - /api routes are handled separately below, not via this path list
const EXEMPT_PATH_PREFIXES = ['/maintenance', '/login', '/reset-password', '/auth/callback', '/admin'];

// Runs on every request. Refreshes the Supabase session cookie so a
// logged-in user stays logged in across page loads, and — when
// Maintenance Mode is on — blocks everyone except admins from using the
// rest of the app.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          response.cookies.set({ name, value: '', ...options });
        }
      }
    }
  );

  // getSession() (not getUser()) for the routine cookie-refresh every
  // request needs — it decodes the JWT locally and only makes a network
  // call to Supabase's Auth server when a refresh is actually due, unlike
  // getUser(), which always revalidates over the network regardless of
  // whether the token is anywhere near expiry. Since this middleware runs
  // on literally every request in the app (see the matcher below), that
  // difference is the single highest-frequency code path there is — the
  // previous unconditional getUser() call here was adding a real network
  // round trip to every page load and every API call, on top of the
  // getUser() each API route already does for its own authorization, which
  // is where a real per-request auth decision actually needs the stronger,
  // always-revalidated check. This call's only job here is refreshing the
  // cookie; its return value isn't used for any decision below.
  await supabase.auth.getSession();

  const path = request.nextUrl.pathname;
  const isExemptPath = EXEMPT_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (!isExemptPath) {
    // Cached — this is the check that runs on every ordinary request, and
    // it's a single cheap in-memory read almost all the time, not a query.
    const maintenanceOn = await getMaintenanceMode(supabase);

    if (maintenanceOn) {
      // Only reached while maintenance mode is actually active (an
      // infrequent, admin-triggered state) — so the extra per-request cost
      // of this uncached admin check, including the one real getUser() call
      // in this file, is bounded to that window, not paid on every request
      // in the app's normal steady state.
      let isAdmin = false;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
        isAdmin = !!profile?.is_admin;
      }

      if (!isAdmin) {
        if (path.startsWith('/api/')) {
          return NextResponse.json({ error: 'Tiding Space is temporarily unavailable for maintenance.' }, { status: 503 });
        }
        return NextResponse.redirect(new URL('/maintenance', request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
