import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// PATCH /api/groups/[id]/members/[userId] — an admin promotes/demotes a
// member. Only ever sends the `role` field, even though RLS (via
// is_group_admin) technically only restricts which row can be touched, not
// which column — the safe-field restriction is enforced here, in the route,
// consistent with how this app handles row-vs-field authorization elsewhere.
export async function PATCH(request: Request, { params }: { params: { id: string; userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { role } = await request.json();
  if (role !== 'admin' && role !== 'member') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  const { data: myMembership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (myMembership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only group admins can change member roles.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('group_members')
    .update({ role })
    .eq('group_id', params.id)
    .eq('user_id', params.userId);

  if (error) {
    console.error('[/api/groups/[id]/members/[userId]] PATCH', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ role });
}

// DELETE /api/groups/[id]/members/[userId] — an admin removes a member.
// Leaving the group yourself is a separate, existing flow
// (DELETE /api/groups/[id]/join) — this one is specifically for removing
// someone else.
export async function DELETE(_request: Request, { params }: { params: { id: string; userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  if (params.userId === user.id) {
    return NextResponse.json({ error: "Use leave group to remove yourself." }, { status: 400 });
  }

  const { data: myMembership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (myMembership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only group admins can remove members.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', params.id)
    .eq('user_id', params.userId);

  if (error) {
    console.error('[/api/groups/[id]/members/[userId]] DELETE', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ removed: true });
}
