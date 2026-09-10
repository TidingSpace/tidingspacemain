import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { createNotification } from '@/lib/notifications';
import { NextResponse } from 'next/server';

// GET /api/admin/activities/[id] — full admin detail view: organizer,
// participant list, recurring status, visibility, and any reports against
// this specific activity.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const [{ data: activity, error }, { data: participants }, { data: reports }] = await Promise.all([
    supabase.from('activities').select('*, organizer:organizer_id ( id, name, handle )').eq('id', params.id).single(),
    supabase.from('rsvps').select('status, user:user_id ( id, name, handle )').eq('activity_id', params.id).order('created_at'),
    supabase.from('reports').select('id, reason, details, status, created_at, reporter:reporter_id ( name, handle )').eq('reported_activity_id', params.id).order('created_at', { ascending: false })
  ]);

  if (error || !activity) return NextResponse.json({ error: 'Activity not found.' }, { status: 404 });

  return NextResponse.json({ activity, participants: participants ?? [], reports: reports ?? [] });
}

// PATCH /api/admin/activities/[id] — status changes (Hide/Unhide/Cancel)
// and/or Featured changes, in the same request or separately. Status is a
// narrow allowlist of values, not an open string field, same reasoning as
// the organizer-facing route. Relies on the activities_update_admin RLS
// policy, distinct from the organizer-only one the public Cancel Activity
// feature uses — an admin isn't necessarily the organizer.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user: adminUser } = admin;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  let statusChangeAction: string | null = null;

  if (body.status !== undefined) {
    // 'active' included here specifically to support Unhide — this was
    // missing before, meaning Unhide never actually worked; every attempt
    // would have failed with "Invalid status."
    if (!['hidden', 'cancelled', 'active'].includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }
    updates.status = body.status;
    statusChangeAction = body.status === 'hidden' ? 'hid activity' : body.status === 'cancelled' ? 'cancelled activity' : 'unhid activity';
  }

  if (body.featured !== undefined) {
    if (typeof body.featured !== 'boolean') return NextResponse.json({ error: 'featured must be a boolean.' }, { status: 400 });
    updates.featured = body.featured;
    if (body.featured) {
      updates.featured_until = body.featured_until || null;
      updates.featured_reason = body.featured_reason?.trim() || null;
    } else {
      updates.featured_until = null;
      updates.featured_reason = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No recognized fields to update.' }, { status: 400 });
  }

  const { data: activity } = await supabase.from('activities').select('title, organizer_id').eq('id', params.id).single();
  if (!activity) return NextResponse.json({ error: 'Activity not found.' }, { status: 404 });

  const { error } = await supabase.from('activities').update(updates).eq('id', params.id);
  if (error) {
    console.error('[/api/admin/activities/[id]] PATCH', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Cancelling as an admin notifies attendees the same way an organizer's
  // own cancellation does — hiding/unhiding does not, since those are
  // quieter moderation actions, not a definite "this isn't happening."
  if (body.status === 'cancelled') {
    const { data: attendees } = await supabase
      .from('rsvps').select('user_id').eq('activity_id', params.id).in('status', ['confirmed', 'waitlisted', 'checked_in']);
    await Promise.all(
      (attendees ?? []).map((r) =>
        createNotification(supabase, { recipientId: r.user_id, actorId: adminUser.id, type: 'activity_cancelled', activityId: params.id })
      )
    );
  }

  if (statusChangeAction) {
    await logAdminAction(supabase, { adminId: adminUser.id, action: statusChangeAction, targetType: 'activity', targetId: params.id, details: activity.title });
  }
  if (body.featured !== undefined) {
    await logAdminAction(supabase, {
      adminId: adminUser.id,
      action: body.featured ? 'featured activity' : 'removed activity from featured',
      targetType: 'activity',
      targetId: params.id,
      details: body.featured_reason?.trim() || activity.title
    });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/activities/[id] — permanent removal, cascades to
// RSVPs/comments/chat history via the existing FK cascades in schema.sql.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user: adminUser } = admin;

  const { data: activity } = await supabase.from('activities').select('title').eq('id', params.id).single();

  const { error } = await supabase.from('activities').delete().eq('id', params.id);
  if (error) {
    console.error('[/api/admin/activities/[id]] DELETE', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  await logAdminAction(supabase, {
    adminId: adminUser.id,
    action: 'deleted activity',
    targetType: 'activity',
    targetId: params.id,
    details: activity?.title ?? null
  });

  return NextResponse.json({ success: true });
}
