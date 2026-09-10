import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { trackServerEvent } from '@/lib/analytics-server';

// POST /api/groups/[id]/members/respond — the invited person accepts or
// declines their own pending invite. Accepting flips status to 'active'
// (real membership from that point on); declining flips it to 'declined' —
// a genuine, kept row rather than a delete, specifically so the invite
// notification can correctly keep showing "Declined" after a reload instead
// of reverting to Accept/Decline buttons (a deleted row would be
// indistinguishable from "never invited at all").
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { accept } = await request.json();

  const { data, error } = await supabase
    .from('group_members')
    .update({ status: accept ? 'active' : 'declined' })
    .eq('group_id', params.id)
    .eq('user_id', user.id)
    .eq('status', 'pending') // only a genuine pending invite can be responded to, not re-triggered on an already-resolved row
    .select('user_id');

  if (error) {
    console.error('[/api/groups/[id]/members/respond]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  // A zero-row match (e.g. a duplicate/replayed call on an invite that was
  // already resolved) reports no error at all — data.length is what
  // actually confirms a real state change happened, not just that the
  // requested action was 'accept'. Without this check, a second call on
  // an already-accepted invite would have silently fired a second
  // group_joined event for a join that didn't actually happen again.
  if (accept && data && data.length > 0) {
    trackServerEvent(user.id, 'group_joined', { via: 'invite' }).catch(() => {});
  }
  return NextResponse.json({ accepted: accept });
}
