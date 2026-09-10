import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// POST /api/saved/posts/[id] — bookmark a post
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('saved_posts')
    .upsert({ user_id: user.id, post_id: params.id }, { onConflict: 'user_id,post_id' });

  if (error) {
    console.error('[/api/saved/posts/[id]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

// DELETE /api/saved/posts/[id] — remove the bookmark
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('saved_posts')
    .delete()
    .eq('user_id', user.id)
    .eq('post_id', params.id);

  if (error) {
    console.error('[/api/saved/posts/[id]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ saved: false });
}
