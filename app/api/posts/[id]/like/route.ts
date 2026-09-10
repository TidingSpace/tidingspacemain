import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';

// POST /api/posts/[id]/like — like a post
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('post_likes')
    .upsert({ post_id: params.id, user_id: user.id }, { onConflict: 'post_id,user_id' });

  if (error) {
    console.error('[/api/posts/[id]/like]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const { data: post } = await supabase.from('posts').select('author_id').eq('id', params.id).maybeSingle();
  if (post) {
    await createNotification(supabase, { recipientId: post.author_id, actorId: user.id, type: 'post_liked', postId: params.id });
  }

  return NextResponse.json({ liked: true });
}

// DELETE /api/posts/[id]/like — unlike a post
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('post_likes')
    .delete()
    .eq('post_id', params.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[/api/posts/[id]/like]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ liked: false });
}
