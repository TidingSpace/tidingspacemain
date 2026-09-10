import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// DELETE /api/groups/[id] — the group's creator deletes it entirely.
// group_members, group_messages, and group_message_reactions all cascade
// via their existing foreign key constraints — nothing extra to clean up
// manually here.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { data: group } = await supabase.from('groups').select('creator_id').eq('id', params.id).maybeSingle();
  if (!group || group.creator_id !== user.id) {
    return NextResponse.json({ error: 'Only the group creator can delete it.' }, { status: 403 });
  }

  const { error } = await supabase.from('groups').delete().eq('id', params.id);

  if (error) {
    console.error('[/api/groups/[id]] DELETE', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
