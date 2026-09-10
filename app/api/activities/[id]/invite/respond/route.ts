import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// POST /api/activities/[id]/invite/respond — the invited person accepts or
// declines their own pending invite. This ONLY updates the invite's status;
// actually joining the activity on accept is a separate call to the
// existing, already-tested /api/rsvp endpoint from the client, rather than
// duplicating its capacity/waitlist logic here.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { accept } = await request.json();

  const { error } = await supabase
    .from('activity_invites')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('activity_id', params.id)
    .eq('invitee_id', user.id)
    .eq('status', 'pending'); // only a genuine pending invite can be responded to, not re-triggered on an already-resolved row

  if (error) {
    console.error('[/api/activities/[id]/invite/respond]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ accepted: accept });
}
