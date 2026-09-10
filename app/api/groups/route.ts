import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { trackServerEvent } from '@/lib/analytics-server';

// GET /api/groups — public groups (browsable) plus any private ones you're in,
// with a flag for whether you're already a member (active) or have a
// pending invite awaiting your response.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS already limits this to public groups + private groups you're a member of
  const { data: allGroups, error } = await supabase
    .from('groups')
    .select('*, members:group_members(user_id, status, last_read_at)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/api/groups]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const groupsList = allGroups ?? [];
  const myActiveGroupIds = groupsList
    .filter((g: any) => (g.members ?? []).some((m: any) => m.user_id === user.id && m.status === 'active'))
    .map((g: any) => g.id);

  // Unread counts — one query for every relevant group's messages, not one
  // query per group. Excludes your own messages (you don't need to be
  // notified that you sent something), same reasoning as createNotification
  // never notifying someone about their own action.
  const unreadCountByGroup = new Map<string, number>();
  if (myActiveGroupIds.length > 0) {
    const { data: recentMessages } = await supabase
      .from('group_messages')
      .select('group_id, created_at')
      .in('group_id', myActiveGroupIds)
      .neq('author_id', user.id);

    const lastReadByGroup = new Map<string, string | null>();
    groupsList.forEach((g: any) => {
      const myRow = (g.members ?? []).find((m: any) => m.user_id === user.id);
      lastReadByGroup.set(g.id, myRow?.last_read_at ?? null);
    });

    (recentMessages ?? []).forEach((m: any) => {
      const lastReadAt = lastReadByGroup.get(m.group_id);
      const isUnread = !lastReadAt || new Date(m.created_at) > new Date(lastReadAt);
      if (isUnread) unreadCountByGroup.set(m.group_id, (unreadCountByGroup.get(m.group_id) ?? 0) + 1);
    });
  }

  const groups = groupsList.map((g: any) => {
    const members = g.members ?? [];
    const myRow = members.find((m: any) => m.user_id === user.id);
    return {
      ...g,
      member_count: members.filter((m: any) => m.status === 'active').length,
      isMember: myRow?.status === 'active',
      isPending: myRow?.status === 'pending',
      unreadCount: unreadCountByGroup.get(g.id) ?? 0,
      members: undefined
    };
  });

  return NextResponse.json({ groups });
}

// POST /api/groups — create a group. Creator is automatically added as its first admin.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to create a group.' }, { status: 401 });

  const { name, description, is_public } = await request.json();
  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'Give your group a name.' }, { status: 400 });
  }

  const { data: group, error } = await supabase
    .from('groups')
    .insert({ name: name.trim(), description: description ?? null, creator_id: user.id, is_public: is_public ?? true })
    .select()
    .single();

  if (error) {
    console.error('[/api/groups]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: group.id, user_id: user.id, role: 'admin' });

  if (memberError) {
    console.error('[/api/groups]', memberError.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // is_public only — never name or description, free text the creator wrote.
  trackServerEvent(user.id, 'group_created', { is_public: is_public ?? true }).catch(() => {});

  return NextResponse.json({ group }, { status: 201 });
}
