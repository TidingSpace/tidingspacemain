import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/profiles/[userId]/following — everyone the given person follows,
// for the "Following" list on their profile.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('follows')
    .select('followed:followed_id ( id, name, handle, avatar_color, avatar_url, is_verified_organizer )')
    .eq('follower_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('[/api/profiles/[userId]/following]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const users = (data ?? []).map((row: any) => row.followed).filter(Boolean);

  // Batched in one query, not N+1 — same reasoning as the followers route.
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
