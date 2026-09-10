import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { trackServerEvent } from '@/lib/analytics-server';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/groups/[id]/join — join a public group.
// RLS enforces that this only succeeds if the group is actually public.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to join.' }, { status: 401 });

  // 30/5min is generous for genuine use while bounding a script hammering
  // this endpoint (e.g. join/leave-spamming a public group).
  const allowed = await checkRateLimit(supabase, user.id, 'group_join', 30, 300);
  if (!allowed) {
    return NextResponse.json({ error: "You're joining groups too quickly — please slow down." }, { status: 429 });
  }

  // Checked before the upsert, not after — an upsert succeeds identically
  // whether it inserted a new row or just re-wrote an existing one, so
  // there's no way to tell "genuinely new join" from "already a member,
  // called this again" from the upsert's own result alone. This is what
  // actually distinguishes them: was this person already active before
  // this request, or not.
  const { data: existingMembership } = await supabase
    .from('group_members')
    .select('status')
    .eq('group_id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();
  const wasAlreadyActive = existingMembership?.status === 'active';

  const { error } = await supabase
    .from('group_members')
    .upsert({ group_id: params.id, user_id: user.id, role: 'member', status: 'active' }, { onConflict: 'group_id,user_id' });

  if (error) {
    if (error.message.includes('row-level security')) {
      return NextResponse.json({ error: "You can't join this group." }, { status: 403 });
    }
    console.error('[/api/groups/[id]/join]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  if (!wasAlreadyActive) {
    trackServerEvent(user.id, 'group_joined', { via: 'direct' }).catch(() => {});
  }
  return NextResponse.json({ joined: true });
}

// DELETE /api/groups/[id]/join — leave a group
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', params.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[/api/groups/[id]/join]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ left: true });
}
