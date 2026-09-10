import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { createNotification } from '@/lib/notifications';

// GET /api/posts/[id]/comments — list comments on a post, oldest first
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('post_comments')
    .select('*, author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer )')
    .eq('post_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[/api/posts/[id]/comments]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ comments: data });
}

// POST /api/posts/[id]/comments — leave a comment ("texting" on a post)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to comment.' }, { status: 401 });

  const allowed = await checkRateLimit(supabase, user.id, 'create_comment', 20, 300); // 20 per 5 minutes
  if (!allowed) {
    return NextResponse.json({ error: "You're commenting too quickly — please wait a few minutes and try again." }, { status: 429 });
  }

  const { text } = await request.json();
  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Comment cannot be empty.' }, { status: 400 });
  }
  if (text.length > 1000) {
    return NextResponse.json({ error: 'Comments are limited to 1000 characters.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: params.id, author_id: user.id, text: text.trim() })
    .select('*, author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer )')
    .single();

  if (error) {
    if (error.message.includes('row-level security')) {
      return NextResponse.json({ error: "You can't comment on this post." }, { status: 403 });
    }
    console.error('[/api/posts/[id]/comments]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const { data: post } = await supabase.from('posts').select('author_id').eq('id', params.id).maybeSingle();
  if (post) {
    await createNotification(supabase, { recipientId: post.author_id, actorId: user.id, type: 'post_commented', postId: params.id });
  }

  return NextResponse.json({ comment: data }, { status: 201 });
}
