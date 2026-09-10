import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/saved/posts — everything you've bookmarked in Feed, most recent first
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('saved_posts')
    .select('created_at, post:post_id ( *, author:author_id ( name, avatar_color, avatar_url ) )')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[/api/saved/posts]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ saved: data });
}
