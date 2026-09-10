import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// PATCH /api/groups/[id]/read — marks the group's chat as read for the
// caller, by stamping their own group_members.last_read_at to now. Called
// when the Group Chat screen opens, not on every message poll — this is a
// deliberate "I looked at this" action, not a side effect of merely fetching
// messages, so a background refresh can't silently mark things read.
export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS (group_members_update_own) already restricts this to the caller's
  // own row — the .eq('user_id', ...) below is redundant with that, but
  // keeps the intent explicit rather than relying solely on RLS to narrow it.
  const { error } = await supabase
    .from('group_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('group_id', params.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[/api/groups/[id]/read]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
