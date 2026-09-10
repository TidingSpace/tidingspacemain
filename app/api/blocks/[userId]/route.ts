import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// POST /api/blocks/[userId] — block someone. Enforced broadly at the RLS
// level, not just here: they immediately can't DM you (or you them), their
// posts/activities/comments disappear from Feed/Explore/Search for you and
// yours for them, and neither of you can follow or comment on the other
// going forward. This route additionally removes any existing follow
// relationship in either direction — remaining "following" someone you've
// just blocked (or who's blocking you) doesn't make sense once blocked.
export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.id === params.userId) {
    return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
  }

  const { error } = await supabase
    .from('blocks')
    .upsert({ blocker_id: user.id, blocked_id: params.userId }, { onConflict: 'blocker_id,blocked_id' });

  if (error) {
    console.error('[/api/blocks/[userId]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  await supabase.from('follows').delete()
    .or(`and(follower_id.eq.${user.id},followed_id.eq.${params.userId}),and(follower_id.eq.${params.userId},followed_id.eq.${user.id})`);

  return NextResponse.json({ blocked: true });
}

// DELETE /api/blocks/[userId] — unblock
export async function DELETE(_request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', params.userId);

  if (error) {
    console.error('[/api/blocks/[userId]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ blocked: false });
}
