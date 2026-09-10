import { requireAdmin } from '@/lib/adminAuth';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/search?query=… — one box, searching users/activities/
// groups/posts at once, by name, handle, title, organizer, or exact ID —
// and by email when the query looks like one. Each result type is capped
// at 5 — this is meant to be a fast "find the thing and jump to it," not a
// full paginated search experience (Users/Activities pages already have
// their own dedicated, paginated search for that).
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') ?? '').trim();
  if (query.length < 2) return NextResponse.json({ users: [], activities: [], groups: [], posts: [] });

  const isUuid = UUID_RE.test(query);
  const looksLikeEmail = query.includes('@');

  // Email search — same real-but-limited approach as the Users page (see
  // that route's own comment): fetches a page of auth users and filters in
  // JS, since email lives in auth.users, not profiles, with no
  // RLS-respecting way to search it directly. Only triggered when the
  // query actually looks like an email, to avoid this cost on every
  // ordinary keystroke.
  let emailMatchedIds: string[] | null = null;
  if (looksLikeEmail) {
    try {
      const adminClient = createAdminClient();
      const { data } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      emailMatchedIds = (data?.users ?? [])
        .filter((u) => u.email?.toLowerCase().includes(query.toLowerCase()))
        .map((u) => u.id)
        .slice(0, 5);
    } catch (e) {
      console.error('[/api/admin/search] email search failed:', e);
      emailMatchedIds = [];
    }
  }

  const userOr = [`name.ilike.%${query}%`, `handle.ilike.%${query}%`];
  if (isUuid) userOr.push(`id.eq.${query}`);

  const activityOr = [`title.ilike.%${query}%`];
  if (isUuid) activityOr.push(`id.eq.${query}`);

  const groupOr = [`name.ilike.%${query}%`];
  if (isUuid) groupOr.push(`id.eq.${query}`);

  const [usersByFieldRes, usersByEmailRes, activitiesRes, groupsRes, postsRes] = await Promise.all([
    supabase.from('profiles').select('id, name, handle, avatar_color, avatar_url').or(userOr.join(',')).limit(5),
    emailMatchedIds && emailMatchedIds.length > 0
      ? supabase.from('profiles').select('id, name, handle, avatar_color, avatar_url').in('id', emailMatchedIds)
      : Promise.resolve({ data: [] as any[] }),
    // Organizer name is matched via a separate query below and merged in,
    // since PostgREST can't OR a condition across a joined table's column
    // and the base table's own columns in one filter expression.
    supabase.from('activities').select('id, title, category, organizer:organizer_id ( name )').or(activityOr.join(',')).limit(5),
    supabase.from('groups').select('id, name').or(groupOr.join(',')).limit(5),
    supabase.from('posts').select('id, text').ilike('text', `%${query}%`).limit(5)
  ]);

  let activities = activitiesRes.data ?? [];
  if (activities.length < 5) {
    const { data: matchingOrganizers } = await supabase.from('profiles').select('id').ilike('name', `%${query}%`);
    const organizerIds = (matchingOrganizers ?? []).map((p) => p.id);
    if (organizerIds.length > 0) {
      const { data: byOrganizer } = await supabase
        .from('activities').select('id, title, category, organizer:organizer_id ( name )')
        .in('organizer_id', organizerIds).limit(5 - activities.length);
      const existingIds = new Set(activities.map((a: any) => a.id));
      activities = [...activities, ...(byOrganizer ?? []).filter((a: any) => !existingIds.has(a.id))];
    }
  }

  const users = [...(usersByFieldRes.data ?? []), ...(usersByEmailRes.data ?? [])];
  const dedupedUsers = Array.from(new Map(users.map((u: any) => [u.id, u])).values()).slice(0, 5);

  return NextResponse.json({
    users: dedupedUsers,
    activities,
    groups: groupsRes.data ?? [],
    posts: postsRes.data ?? []
  });
}
