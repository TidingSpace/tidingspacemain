import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';

// GET /api/groups/[id]/members — active members of the group, for the
// Manage Members screen. RLS (group_members_select) already restricts this
// to members of a group you're also in, or any public group.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('group_members')
    .select('role, joined_at, profile:user_id ( id, name, handle, avatar_color, avatar_url )')
    .eq('group_id', params.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('[/api/groups/[id]/members] GET', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ members: data, myId: user.id });
}

// POST /api/groups/[id]/members — an admin invites someone else to the
// group. Creates a 'pending' row (NOT instant membership — is_group_member()
// only counts 'active' rows, so this grants no chat access) and notifies the
// invited person. They become an actual member only by accepting via
// /api/groups/[id]/members/respond.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { user_id } = await request.json();
  if (!user_id) return NextResponse.json({ error: 'A user to add is required.' }, { status: 400 });

  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only group admins can add people.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('group_members')
    .upsert({ group_id: params.id, user_id, role: 'member', status: 'pending' }, { onConflict: 'group_id,user_id' });

  if (error) {
    if (error.message.includes('row-level security')) {
      return NextResponse.json({ error: "You can't add this person." }, { status: 403 });
    }
    console.error('[/api/groups/[id]/members]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Awaited, not fire-and-forget — this notification IS the invite; if it
  // silently failed to write, the invited person would never know they'd
  // been added at all.
  await createNotification(supabase, { recipientId: user_id, actorId: user.id, type: 'group_invite', groupId: params.id });

  return NextResponse.json({ invited: true });
}
