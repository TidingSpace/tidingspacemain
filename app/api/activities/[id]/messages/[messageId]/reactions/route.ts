import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

const ALLOWED_EMOJI = ['❤️', '👍', '😂', '🔥', '🙏'];

// POST /api/activities/[id]/messages/[messageId]/reactions — toggle, same
// pattern as the group-chat equivalent. RLS enforces that only the
// organizer or a confirmed/waitlisted/checked-in attendee can react.
export async function POST(request: Request, { params }: { params: { id: string; messageId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to react.' }, { status: 401 });

  const { emoji } = await request.json();
  if (!ALLOWED_EMOJI.includes(emoji)) {
    return NextResponse.json({ error: 'Unsupported reaction.' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('activity_message_reactions')
    .select('*')
    .eq('message_id', params.messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('activity_message_reactions')
      .delete()
      .eq('message_id', params.messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);
    if (error) {
      console.error('[/api/activities/[id]/messages/[messageId]/reactions]', error.message);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ reacted: false });
  }

  const { error } = await supabase
    .from('activity_message_reactions')
    .insert({ message_id: params.messageId, user_id: user.id, emoji });
  if (error) {
    console.error('[/api/activities/[id]/messages/[messageId]/reactions]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ reacted: true });
}
