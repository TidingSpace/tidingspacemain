import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// The one place every admin API route checks admin status. RLS
// (is_admin() in schema.sql) is the deeper enforcement layer — even if a
// route forgot this check entirely, RLS would still block a non-admin from
// reading admin-only tables like admin_audit_log or all of `reports`. This
// helper is the first, fast rejection: a clean 403 with no data ever
// touched, rather than relying on a query simply coming back empty.
//
// Returns either { user, supabase } to proceed with, or { error } — a
// ready-to-return NextResponse — when the caller isn't an authenticated
// admin. Every admin route should look like:
//
//   const admin = await requireAdmin();
//   if (admin.error) return admin.error;
//   const { user, supabase } = admin;
export async function requireAdmin(): Promise<
  { error: NextResponse; user?: undefined; supabase?: undefined } |
  { error?: undefined; user: { id: string }; supabase: ReturnType<typeof createClient> }
> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!profile?.is_admin) {
    return { error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) };
  }

  return { user, supabase };
}
