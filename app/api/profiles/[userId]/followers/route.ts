import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/profiles/[userId]/followers — the given person's followers,
// for the "Followers" list on their profile. Public, like the follower
// count already shown there — not restricted to viewing your own.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('follows')
    .select('follower:follower_id ( id, name, handle, avatar_color, avatar_url, is_verified_organizer )')
    .eq('followed_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('[/api/profiles/[userId]/followers]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const users = (data ?? []).map((row: any) => row.follower).filter(Boolean);

  // Batched in one query, not N+1 — lets each row in the list show its
  // own correct Follow/Following state, since the viewer might already
  // follow some of these people and not others.
  let followingIds = new Set<string>();
  if (users.length > 0) {
    const { data: myFollows } = await supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', user.id)
      .in('followed_id', users.map((u: any) => u.id));
    followingIds = new Set((myFollows ?? []).map((r: any) => r.followed_id));
  }

  return NextResponse.json({
    users: users.map((u: any) => ({ ...u, isFollowedByViewer: followingIds.has(u.id) }))
  });
}
