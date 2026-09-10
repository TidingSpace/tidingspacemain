import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/activities/[id]/attendees — the attendee list, organizer-only in practice
// (RLS's rsvps_select_own_or_organizer means a non-organizer only ever sees their own row here).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('rsvps')
    .select('*, profile:user_id ( id, name, avatar_color, avatar_url, handle )')
    .eq('activity_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[/api/activities/[id]/attendees]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ attendees: data });
}

// PATCH /api/activities/[id]/attendees — check someone in, cancel, or promote from waitlist.
// RLS (rsvps_update_by_organizer) enforces that only the organizer of this activity can do this.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { rsvp_id, status } = await request.json();
  if (!rsvp_id || !['confirmed', 'waitlisted', 'cancelled', 'checked_in'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('rsvps')
    .update({ status })
    .eq('id', rsvp_id)
    .eq('activity_id', params.id)
    .select()
    .single();

  // If RLS blocked it (not the organizer), Supabase returns no error but 0 rows —
  // data will be null in that case.
  if (error) {
    console.error('[/api/activities/[id]/attendees]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not authorized to update this attendee.' }, { status: 403 });

  return NextResponse.json({ rsvp: data });
}
