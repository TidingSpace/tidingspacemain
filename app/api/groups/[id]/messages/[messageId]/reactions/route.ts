import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// A small, fixed set rather than a full emoji picker — matches the compact
// "floating reaction pill" pattern (a handful of common reactions), not a
// general-purpose emoji keyboard. Kept in sync with the same set used on
// activity message reactions for consistency.
const ALLOWED_EMOJI = ['❤️', '👍', '😂', '🔥', '🙏'];

// POST /api/groups/[id]/messages/[messageId]/reactions — toggle: if you've
// already reacted with this emoji, remove it; otherwise add it. RLS (via
// is_group_member) enforces that only actual members can react at all.
export async function POST(request: Request, { params }: { params: { id: string; messageId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to react.' }, { status: 401 });

  const { emoji } = await request.json();
  if (!ALLOWED_EMOJI.includes(emoji)) {
    return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('group_message_reactions')
    .select('*')
    .eq('message_id', params.messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('group_message_reactions')
      .delete()
      .eq('message_id', params.messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);
    if (error) {
      console.error('[/api/groups/[id]/messages/[messageId]/reactions]', error.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ reacted: false });
  }

  const { error } = await supabase
    .from('group_message_reactions')
    .insert({ message_id: params.messageId, user_id: user.id, emoji });
  if (error) {
    console.error('[/api/groups/[id]/messages/[messageId]/reactions]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ reacted: true });
}
