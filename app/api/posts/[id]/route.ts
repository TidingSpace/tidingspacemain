import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/posts/[id] — a single post with author/activity/original-post joins,
// same shape as the list endpoint so the detail page can reuse the same rendering logic.
// Queries the `posts` table directly for the same reliability reason as the
// list endpoint — counts are merged in afterward, not embedded via a view.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: post, error } = await supabase
    .from('posts')
    .select(`
      *,
      author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer ),
      activity:activity_id ( id, title, category ),
      original:repost_of (
        id, type, text, image_url, image_urls, created_at,
        author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer )
      )
    `)
    .eq('id', params.id)
    .single();

  if (error || !post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });

  const [{ count: like_count }, { count: comment_count }, { count: repost_count }] = await Promise.all([
    supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', params.id),
    supabase.from('post_comments').select('*', { count: 'exact', head: true }).eq('post_id', params.id),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('repost_of', params.id)
  ]);

  // My own repost of this post, if any — same purpose as in the list route:
  // lets the frontend show a persisted "already reposted" state and know
  // which row to delete to undo it.
  let my_repost_id: string | null = null;
  let liked_by_me = false;
  let saved_by_me = false;
  if (user) {
    const [{ data: myRepost }, { data: myLike }, { data: mySave }] = await Promise.all([
      supabase.from('posts').select('id').eq('author_id', user.id).eq('repost_of', params.id).maybeSingle(),
      supabase.from('post_likes').select('post_id').eq('user_id', user.id).eq('post_id', params.id).maybeSingle(),
      supabase.from('saved_posts').select('post_id').eq('user_id', user.id).eq('post_id', params.id).maybeSingle()
    ]);
    my_repost_id = myRepost?.id ?? null;
    liked_by_me = !!myLike;
    saved_by_me = !!mySave;
  }

  return NextResponse.json({ post: { ...post, like_count: like_count ?? 0, comment_count: comment_count ?? 0, repost_count: repost_count ?? 0, my_repost_id, liked_by_me, saved_by_me } });
}

// DELETE /api/posts/[id] — the author can delete their own post. RLS
// (posts_delete_own) enforces this at the database level regardless of what
// this route does, but we check ownership explicitly here too so we know
// whether to also clean up the post's images from Storage.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: post } = await supabase
    .from('posts')
    .select('author_id, image_urls')
    .eq('id', params.id)
    .single();

  if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
  if (post.author_id !== user.id) {
    return NextResponse.json({ error: 'You can only delete your own posts.' }, { status: 403 });
  }

  const { error } = await supabase.from('posts').delete().eq('id', params.id);
  if (error) {
    console.error('[/api/posts/[id]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Clean up any uploaded images so deleting a post doesn't leave orphaned
  // files sitting in the post-images bucket.
  if (post.image_urls && post.image_urls.length > 0) {
    const paths = post.image_urls
      .map((url: string) => {
        const marker = '/object/public/post-images/';
        const idx = url.indexOf(marker);
        return idx === -1 ? null : url.slice(idx + marker.length);
      })
      .filter(Boolean) as string[];
    if (paths.length > 0) {
      try {
        await supabase.storage.from('post-images').remove(paths);
      } catch {
        // Fire-and-forget — a failed image cleanup shouldn't surface as an
        // error for a post deletion that already succeeded.
      }
    }
  }

  return NextResponse.json({ success: true });
}
