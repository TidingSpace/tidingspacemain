import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('activities_with_availability')
    .select('*, profiles:organizer_id (id, name, avatar_color, avatar_url, verification_tier)')
    .eq('id', params.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  let myRsvpStatus: string | null = null;
  if (user) {
    const { data: rsvp } = await supabase
      .from('rsvps')
      .select('status')
      .eq('activity_id', params.id)
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .maybeSingle();
    myRsvpStatus = rsvp?.status ?? null;
  }

  // Public attendee sample for "People going" — relies on the rsvps_select_public_confirmed
  // policy, which makes confirmed/checked-in rows visible to any viewer, not just the organizer.
  const { data: attendeeRows, count: goingCount } = await supabase
    .from('rsvps')
    .select('profile:user_id ( id, name, avatar_color, avatar_url )', { count: 'exact' })
    .eq('activity_id', params.id)
    .in('status', ['confirmed', 'checked_in'])
    .limit(8);

  return NextResponse.json({
    activity: {
      ...data,
      my_rsvp_status: myRsvpStatus,
      going_count: goingCount ?? 0,
      attendees_sample: (attendeeRows ?? []).map((r: any) => r.profile).filter(Boolean)
    }
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  // Explicit allowlist rather than passing the raw body through — organizer_id,
  // id, created_at, and the recurrence/pin fields all have their own
  // dedicated flows (or must never change via this route at all), so none of
  // them are accepted here even though RLS's WITH CHECK also happens to block
  // reassigning organizer_id today. This is about not silently exposing
  // whatever column gets added to this table next, not just today's fields.
  //
  // status is a narrow, deliberate exception: it's constrained to exactly
  // 'cancelled' (not left open to any string) because that's the one
  // legitimate transition an organizer makes through this same generic
  // route (Explore's Cancel Activity action) — anything else stays excluded.
  const updates: Record<string, unknown> = {};
  if (typeof body.category === 'string') updates.category = body.category;
  if (typeof body.title === 'string') updates.title = body.title.trim();
  if (typeof body.description === 'string') updates.description = body.description.trim();
  if (typeof body.latitude === 'number') updates.latitude = body.latitude;
  if (typeof body.longitude === 'number') updates.longitude = body.longitude;
  if (typeof body.address === 'string' || body.address === null) updates.address = body.address;
  if (typeof body.starts_at === 'string') updates.starts_at = body.starts_at;
  if (typeof body.ends_at === 'string' || body.ends_at === null) updates.ends_at = body.ends_at;
  if (typeof body.price_cents === 'number') updates.price_cents = body.price_cents;
  if (typeof body.capacity === 'number') updates.capacity = body.capacity;
  if (typeof body.cover_image_url === 'string' || body.cover_image_url === null) updates.cover_image_url = body.cover_image_url;
  if (body.status === 'cancelled') updates.status = 'cancelled';

  // An empty update here means every field in the request body was rejected
  // by the allowlist above — almost certainly a caller sending a field this
  // route doesn't (yet) recognize, not a legitimate "update nothing" request.
  // Failing clearly here beats letting Supabase reject an empty payload with
  // a generic, hard-to-diagnose error.
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No recognized fields to update.' }, { status: 400 });
  }

  // RLS enforces that only the organizer can update — this will fail silently
  // (0 rows updated) if someone else tries it, which is the correct behavior.
  const { data, error } = await supabase
    .from('activities')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    console.error('[/api/activities/[id]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Cancellation notifications — every person still attending in any real
  // sense (confirmed, waitlisted, or already checked in) gets told, not
  // just confirmed attendees. Someone who'd already cancelled their own
  // RSVP is skipped — they're not attending anymore, so this isn't news to
  // them. Awaited (not fire-and-forget): if this silently failed, an
  // organizer could reasonably believe attendees were told when they
  // weren't, which is worse than the cancellation itself taking slightly
  // longer to confirm.
  if (updates.status === 'cancelled') {
    const { data: attendees } = await supabase
      .from('rsvps')
      .select('user_id')
      .eq('activity_id', params.id)
      .in('status', ['confirmed', 'waitlisted', 'checked_in']);

    await Promise.all(
      (attendees ?? []).map((r) =>
        createNotification(supabase, { recipientId: r.user_id, actorId: user.id, type: 'activity_cancelled', activityId: params.id })
      )
    );
  }

  return NextResponse.json({ activity: data });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase.from('activities').delete().eq('id', params.id);
  if (error) {
    console.error('[/api/activities/[id]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
