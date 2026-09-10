import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/users/followers — the current user's own followers (people who
// follow ME), for pickers like "Invite People" where showing your
// followers by default is more useful than an empty search box.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('follows')
    .select('follower:follower_id ( id, name, handle, avatar_color, avatar_url )')
    .eq('followed_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[/api/users/followers]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ users: (data ?? []).map((row: any) => row.follower).filter(Boolean) });
}
