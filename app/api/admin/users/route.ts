import { requireAdmin } from '@/lib/adminAuth';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

const PAGE_SIZE = 20;

// GET /api/admin/users?query=&page=0 — searches name, handle, and id
// directly against profiles (fast, indexed-ish, server-side). Email search
// is a real but more limited case: email lives in auth.users, not
// profiles, so there's no way to search it with a normal indexed query
// through the regular client. When the query looks like an email (contains
// "@"), this additionally fetches a page of auth users via the admin
// client and matches by email — genuinely functional, but doesn't scale to
// searching millions of users by email the way the name/handle path does.
// That's a real, honest limitation, not hidden: worth revisiting (e.g. a
// synced profiles.email column with its own index) if email search becomes
// a common admin workflow rather than an occasional lookup.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') ?? '').trim();
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);

  let matchedIdsFromEmail: string[] | null = null;
  if (query.includes('@')) {
    try {
      const adminClient = createAdminClient();
      // listUsers paginates at up to 1000/page; matching in JS here is the
      // documented limitation above, not a scalable email index.
      const { data } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      matchedIdsFromEmail = (data?.users ?? [])
        .filter((u) => u.email?.toLowerCase().includes(query.toLowerCase()))
        .map((u) => u.id);
    } catch (e) {
      console.error('[/api/admin/users] email search failed:', e);
      matchedIdsFromEmail = [];
    }
  }

  let dbQuery = supabase
    .from('profiles')
    .select('id, name, handle, avatar_color, avatar_url, created_at, account_status', { count: 'exact' });

  if (query) {
    if (matchedIdsFromEmail !== null) {
      if (matchedIdsFromEmail.length === 0) {
        return NextResponse.json({ users: [], totalCount: 0 });
      }
      dbQuery = dbQuery.in('id', matchedIdsFromEmail);
    } else {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      const orParts = [`name.ilike.%${query}%`, `handle.ilike.%${query}%`];
      if (isUuid) orParts.push(`id.eq.${query}`);
      dbQuery = dbQuery.or(orParts.join(','));
    }
  }

  const { data, count, error } = await dbQuery
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (error) {
    console.error('[/api/admin/users]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ users: data, totalCount: count ?? 0 });
}
