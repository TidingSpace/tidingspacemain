import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { createNotification } from '@/lib/notifications';

// POST /api/activities/[id]/invite — invites one person at a time (matching
// the UI, which sends each invite the moment its button is tapped, the same
// pattern group chat's "Add People" already uses — not a batch multi-select).
// Creates a real activity_invites row so accept/decline has somewhere to be
// persisted, plus a notification so it's actually visible to the invitee —
// a plain notification row alone has no memory of being responded to.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { userId: inviteeId } = await request.json();
  if (!inviteeId || typeof inviteeId !== 'string') {
    return NextResponse.json({ error: 'A person to invite is required.' }, { status: 400 });
  }
  if (inviteeId === user.id) {
    return NextResponse.json({ error: "You can't invite yourself." }, { status: 400 });
  }

  const { data: activity } = await supabase
    .from('activities')
    .select('id, title, organizer_id')
    .eq('id', params.id)
    .single();
  if (!activity) return NextResponse.json({ error: 'Activity not found.' }, { status: 404 });

  // Only the organizer or a confirmed attendee can invite others — not
  // just anyone who happens to know the activity's ID.
  const isOrganizer = activity.organizer_id === user.id;
  if (!isOrganizer) {
    const { data: rsvp } = await supabase
      .from('rsvps')
      .select('status')
      .eq('activity_id', params.id)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .maybeSingle();
    if (!rsvp) {
      return NextResponse.json({ error: 'Only the organizer or confirmed attendees can invite people.' }, { status: 403 });
    }
  }

  // Rate limit on invite ACTIONS, not a batch — each button tap is its own
  // request now, so this bounds rapid-fire invites the same way the DM rate
  // limit bounds message spam, without needing a separate "batch" concept.
  const allowed = await checkRateLimit(supabase, user.id, 'invite_to_activity', 30, 300);
  if (!allowed) {
    return NextResponse.json({ error: "You're sending invites too quickly — please slow down." }, { status: 429 });
  }

  // Re-inviting someone with a pending or already-accepted invite is a
  // harmless no-op — no reason to spam a second notification for
  // something they haven't decided on yet, or already said yes to.
  // A DECLINED invite is different: that's a real, deliberate re-invite,
  // and should reset back to pending with a fresh notification, not stay
  // silently stuck on their first "no" forever.
  //
  // Uses the admin client, not the normal one — RLS's select policy on
  // this table only allows the ORIGINAL inviter or the invitee to see a
  // given row. If a DIFFERENT organizer/attendee (not the person who sent
  // the first invite) tries to invite the same person, their own
  // RLS-scoped query would see nothing here even though a row genuinely
  // exists — a false "not yet invited" result that led straight into the
  // database's own unique constraint on the insert below. This existence
  // check needs to see the real, full picture regardless of who's asking,
  // which is exactly what the admin client is for.
  const adminSupabase = createAdminClient();
  const { data: existing } = await adminSupabase
    .from('activity_invites')
    .select('id, status')
    .eq('activity_id', activity.id)
    .eq('invitee_id', inviteeId)
    .maybeSingle();

  if (!existing) {
    const { error: insertError } = await adminSupabase
      .from('activity_invites')
      .insert({ activity_id: activity.id, inviter_id: user.id, invitee_id: inviteeId, status: 'pending' });
    if (insertError) {
      console.error('[/api/activities/[id]/invite]', insertError.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    await createNotification(supabase, {
      recipientId: inviteeId,
      actorId: user.id,
      type: 'activity_invite',
      activityId: activity.id
    });
  } else if (existing.status === 'declined') {
    // Also updates inviter_id to whoever is re-extending the invite now —
    // the field represents the current, active invite, not necessarily
    // whoever happened to send the very first one.
    const { error: updateError } = await adminSupabase
      .from('activity_invites')
      .update({ status: 'pending', responded_at: null, inviter_id: user.id })
      .eq('id', existing.id);
    if (updateError) {
      console.error('[/api/activities/[id]/invite]', updateError.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    await createNotification(supabase, {
      recipientId: inviteeId,
      actorId: user.id,
      type: 'activity_invite',
      activityId: activity.id
    });
  }

  return NextResponse.json({ ok: true, status: existing?.status === 'declined' ? 'pending' : (existing?.status ?? 'pending') });
}
