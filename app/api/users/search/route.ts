import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/users/search?q=... — find anyone on the platform by name, to start a DM
// or invite to a group. Not limited to people you've done an activity with.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ users: [] });

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, handle, avatar_color, avatar_url')
    .neq('id', user.id)
    .ilike('name', `%${q}%`)
    .limit(20);

  if (error) {
    console.error('[/api/users/search]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ users: data });
}
