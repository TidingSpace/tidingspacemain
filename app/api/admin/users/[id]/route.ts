import { requireAdmin } from '@/lib/adminAuth';
import { createAdminClient } from '@/lib/supabase-admin';
import { logAdminAction } from '@/lib/adminAudit';
import { NextResponse } from 'next/server';

// GET /api/admin/users/[id] — full detail for one user: profile, real
// counts (followers/following/activities organized/groups joined — all
// genuine queries, not estimates), and email (fetched per-user via the
// admin client's getUserById, which is a cheap, scoped lookup — very
// different in cost from the list route's listUsers-and-filter approach).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const [
    { data: profile, error }, { count: followerCount }, { count: followingCount },
    { count: activitiesCount }, { count: groupsCount }, { count: postsCount },
    { count: reportsSubmitted }, { count: reportsReceived }, { count: activitiesJoinedCount }
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', params.id).single(),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followed_id', params.id),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', params.id),
    supabase.from('activities').select('*', { count: 'exact', head: true }).eq('organizer_id', params.id),
    supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('user_id', params.id).eq('status', 'active'),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', params.id),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('reporter_id', params.id),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('reported_user_id', params.id),
    supabase.from('rsvps').select('*', { count: 'exact', head: true }).eq('user_id', params.id).in('status', ['confirmed', 'checked_in'])
  ]);

  if (error || !profile) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  let email: string | null = null;
  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient.auth.admin.getUserById(params.id);
    email = data.user?.email ?? null;
  } catch (e) {
    console.error('[/api/admin/users/[id]] email lookup failed:', e);
  }

  // Suspension history: not tracked as its own table yet — every suspend/
  // ban/reinstate for this user already lives in admin_audit_log, so this
  // derives the history from there rather than needing a separate table.
  const { data: suspensionHistory } = await supabase
    .from('admin_audit_log')
    .select('id, action, created_at, admin:admin_id ( name )')
    .eq('target_type', 'user')
    .eq('target_id', params.id)
    .in('action', ['suspended user', 'banned user', 'reinstated user', 'suspended user (via report)'])
    .order('created_at', { ascending: false });

  return NextResponse.json({
    user: {
      ...profile,
      email,
      followerCount: followerCount ?? 0,
      followingCount: followingCount ?? 0,
      activitiesCount: activitiesCount ?? 0,
      groupsCount: groupsCount ?? 0,
      postsCount: postsCount ?? 0,
      activitiesJoinedCount: activitiesJoinedCount ?? 0,
      reportsSubmitted: reportsSubmitted ?? 0,
      reportsReceived: reportsReceived ?? 0,
      suspensionHistory: suspensionHistory ?? []
    }
  });
}

// PATCH /api/admin/users/[id] — suspend / unsuspend / ban. Every call logs
// itself to the audit trail, and account_status is enforced for real (see
// is_active_account() in schema.sql) on the highest-value write paths —
// this isn't a cosmetic flag with no actual effect.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user: adminUser } = admin;

  const body = await request.json();
  const { data: target } = await supabase.from('profiles').select('name').eq('id', params.id).single();
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  if (body.account_status !== undefined) {
    if (!['active', 'suspended', 'banned'].includes(body.account_status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }
    const { error } = await supabase.from('profiles').update({ account_status: body.account_status }).eq('id', params.id);
    if (error) { console.error('[/api/admin/users/[id]]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

    const actionLabel = body.account_status === 'active' ? 'reinstated user' : body.account_status === 'suspended' ? 'suspended user' : 'banned user';
    await logAdminAction(supabase, { adminId: adminUser.id, action: actionLabel, targetType: 'user', targetId: params.id, details: target.name });
  }

  if (body.is_verified_organizer !== undefined) {
    if (typeof body.is_verified_organizer !== 'boolean') return NextResponse.json({ error: 'is_verified_organizer must be a boolean.' }, { status: 400 });
    const { error } = await supabase.from('profiles').update({ is_verified_organizer: body.is_verified_organizer }).eq('id', params.id);
    if (error) { console.error('[/api/admin/users/[id]]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

    await logAdminAction(supabase, {
      adminId: adminUser.id,
      action: body.is_verified_organizer ? 'verified organizer' : 'removed organizer verification',
      targetType: 'user',
      targetId: params.id,
      details: target.name
    });
  }

  return NextResponse.json({ ok: true });
}
