import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// PATCH /api/groups/[id]/pin — pin (or unpin, with message_id: null) a
// message. Admin-only, matching the same permission level as editing the
// group itself (groups_update_admin already covers this exact update since
// pinned_message_id is just a column on groups — no new RLS policy needed).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { message_id } = await request.json();

  // Explicit check for a clean error message — RLS (groups_update_admin)
  // enforces the same rule regardless, this is just a nicer failure mode
  // than a raw RLS rejection.
  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only group admins can pin messages.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('groups')
    .update({ pinned_message_id: message_id ?? null })
    .eq('id', params.id);

  if (error) {
    console.error('[/api/groups/[id]/pin]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ pinned: message_id ?? null });
}
