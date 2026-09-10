import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createNotification, notifyFollowers } from '@/lib/notifications';
import { getActivityTimeState } from '@/lib/activityTimeState';
import { trackServerEvent } from '@/lib/analytics-server';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/rsvp — join an activity. Auto-waitlists if it's full.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'You must be logged in to join.' }, { status: 401 });
  }

  // 30/5min is generous for genuine use (nobody joins that many activities
  // for real) while bounding a script hammering this endpoint.
  const allowed = await checkRateLimit(supabase, user.id, 'rsvp', 30, 300);
  if (!allowed) {
    return NextResponse.json({ error: "You're joining activities too quickly — please slow down." }, { status: 429 });
  }

  let activity_id: string | undefined;
  try {
    ({ activity_id } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (!activity_id) {
    return NextResponse.json({ error: 'activity_id is required.' }, { status: 400 });
  }

  // Check capacity vs. current confirmed RSVPs
  const { data: activity, error: actError } = await supabase
    .from('activities')
    .select('capacity, organizer_id, starts_at, ends_at, category')
    .eq('id', activity_id)
    .single();

  if (actError || !activity) {
    return NextResponse.json({ error: 'Activity not found.' }, { status: 404 });
  }

  // Real enforcement, not just a UI affordance — someone hitting this route
  // directly (not through the Join button) must be rejected the same way.
  // Uses the same getActivityTimeState() every other screen already relies
  // on, so "finished" here can never disagree with what the activity
  // actually displays as elsewhere.
  if (getActivityTimeState(activity.starts_at, activity.ends_at) === 'finished') {
    return NextResponse.json({ error: 'This activity has already ended.' }, { status: 400 });
  }

  const { count: confirmedCount } = await supabase
    .from('rsvps')
    .select('*', { count: 'exact', head: true })
    .eq('activity_id', activity_id)
    .eq('status', 'confirmed');

  const status = (confirmedCount ?? 0) >= activity.capacity ? 'waitlisted' : 'confirmed';

  const { data, error } = await supabase
    .from('rsvps')
    .upsert(
      { activity_id, user_id: user.id, status },
      { onConflict: 'activity_id,user_id' }
    )
    .select()
    .single();

  if (error) {
    // RLS now also rejects this insert if either the attendee or the
    // organizer has blocked the other — same detection pattern used in
    // /api/follows, rather than a separate pre-check query.
    if (error.message.includes('row-level security')) {
      return NextResponse.json({ error: "You can't join this activity." }, { status: 403 });
    }
    console.error('[/api/rsvp]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Notify the organizer someone joined, and notify anyone who follows the
  // person joining — excluding the organizer from that second one, since if
  // they also follow this person, they'd otherwise get two notifications
  // for the exact same join (this was a real, reported duplicate-feeling
  // notification bug, not intentional double-notifying).
  // Awaited (not fire-and-forget) — on serverless, work that isn't awaited
  // before the response returns isn't guaranteed to finish. Run
  // concurrently since the two notifications are independent of each other.
  await Promise.all([
    createNotification(supabase, { recipientId: activity.organizer_id, actorId: user.id, type: 'new_attendee', activityId: activity_id }),
    notifyFollowers(supabase, { ofUserId: user.id, actorId: user.id, type: 'friend_joined_activity', activityId: activity_id, excludeUserId: activity.organizer_id })
  ]);

  // Only for an actually-confirmed spot, not waitlisted — "joined" should
  // mean joined, not queued and possibly never seated.
  if (status === 'confirmed') {
    trackServerEvent(user.id, 'activity_joined', { category: activity.category }).catch(() => {});
  }

  return NextResponse.json({ rsvp: data });
}

// DELETE /api/rsvp?activity_id=... — cancel your RSVP
export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const activity_id = searchParams.get('activity_id');
  if (!activity_id) return NextResponse.json({ error: 'activity_id is required.' }, { status: 400 });

  const { error } = await supabase
    .from('rsvps')
    .update({ status: 'cancelled' })
    .eq('activity_id', activity_id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[/api/rsvp]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  trackServerEvent(user.id, 'activity_left', { activity_id }).catch(() => {});
  return NextResponse.json({ success: true });
}
