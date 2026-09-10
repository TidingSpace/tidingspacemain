import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';

// POST /api/follows/[followedId] — follow anyone (a regular user or a business/organizer).
// Generalized from an earlier organizer-only naming — the data model never actually
// restricted this, so this is a rename/product clarification, not a new capability.
export async function POST(_request: Request, { params }: { params: { followedId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('follows')
    .upsert({ follower_id: user.id, followed_id: params.followedId }, { onConflict: 'follower_id,followed_id' });

  if (error) {
    // RLS now also rejects this insert if either person has blocked the
    // other — detected by the error shape rather than a separate pre-check
    // query, so this doesn't cost an extra round trip on the common,
    // successful path.
    if (error.message.includes('row-level security')) {
      return NextResponse.json({ error: "You can't follow this person." }, { status: 403 });
    }
    console.error('[/api/follows/[followedId]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  await createNotification(supabase, { recipientId: params.followedId, actorId: user.id, type: 'new_follower' });

  return NextResponse.json({ following: true });
}

// DELETE /api/follows/[followedId] — unfollow
export async function DELETE(_request: Request, { params }: { params: { followedId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', user.id)
    .eq('followed_id', params.followedId);

  if (error) {
    console.error('[/api/follows/[followedId]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ following: false });
}
