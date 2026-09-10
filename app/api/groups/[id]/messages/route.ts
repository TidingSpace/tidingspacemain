import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendPushToUser } from '@/lib/pushNotifications';
import { trackServerEvent } from '@/lib/analytics-server';

// GET /api/groups/[id]/messages — a group's chat history, plus each
// message's aggregated reactions and the group's pinned message (if any).
// RLS restricts the messages themselves to actual members, so a non-member
// gets an empty result, not an error.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: messages, error } = await supabase
    .from('group_messages')
    .select('*, author:author_id ( id, name, avatar_color, avatar_url )')
    .eq('group_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[/api/groups/[id]/messages]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Aggregate reactions here rather than with a second round trip per
  // message — one query for every reaction on every message in this
  // thread, grouped into { emoji, count, reactedByMe }.
  let reactionsByMessage: Record<string, { emoji: string; count: number; reactedByMe: boolean }[]> = {};
  if (messages && messages.length > 0) {
    const messageIds = messages.map((m) => m.id);
    const { data: reactions } = await supabase
      .from('group_message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds);

    const grouped = new Map<string, Map<string, { count: number; reactedByMe: boolean }>>();
    (reactions ?? []).forEach((r) => {
      if (!grouped.has(r.message_id)) grouped.set(r.message_id, new Map());
      const byEmoji = grouped.get(r.message_id)!;
      const existing = byEmoji.get(r.emoji) ?? { count: 0, reactedByMe: false };
      existing.count += 1;
      if (user && r.user_id === user.id) existing.reactedByMe = true;
      byEmoji.set(r.emoji, existing);
    });

    reactionsByMessage = Object.fromEntries(
      Array.from(grouped.entries()).map(([messageId, byEmoji]) => [
        messageId,
        Array.from(byEmoji.entries()).map(([emoji, v]) => ({ emoji, ...v }))
      ])
    );
  }

  const messagesWithReactions = (messages ?? []).map((m) => ({ ...m, reactions: reactionsByMessage[m.id] ?? [] }));

  // The group's pinned message, if it has one — fetched as its own small
  // lookup rather than a join, since it's a single row at most.
  let pinnedMessage = null;
  const { data: group } = await supabase.from('groups').select('pinned_message_id').eq('id', params.id).maybeSingle();
  if (group?.pinned_message_id) {
    const { data: pinned } = await supabase
      .from('group_messages')
      .select('id, text, image_url, author:author_id ( name )')
      .eq('id', group.pinned_message_id)
      .maybeSingle();
    pinnedMessage = pinned ?? null;
  }

  return NextResponse.json({ messages: messagesWithReactions, pinnedMessage });
}

// POST /api/groups/[id]/messages — post to a group chat (members only, enforced by RLS)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to post.' }, { status: 401 });

  // Added during a security review — this endpoint had no rate limiting at
  // all. Same limit as direct messages for consistency.
  const allowed = await checkRateLimit(supabase, user.id, 'send_group_message', 30, 300);
  if (!allowed) {
    return NextResponse.json({ error: "You're sending messages too quickly — please slow down." }, { status: 429 });
  }

  const { text, image_url } = await request.json();
  if ((!text || !text.trim()) && !image_url) {
    return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
  }
  if (typeof text === 'string' && text.length > 5000) {
    return NextResponse.json({ error: 'Messages are limited to 5000 characters.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('group_messages')
    .insert({ group_id: params.id, author_id: user.id, text: text?.trim() || '', image_url: image_url ?? null })
    .select('*, author:author_id ( id, name, avatar_color, avatar_url )')
    .single();

  if (error) {
    console.error('[/api/groups/[id]/messages]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Best-effort, fire-and-forget — never blocks or fails the response.
  // Notifies every OTHER active member, not the sender.
  (async () => {
    const [{ data: group }, { data: members }] = await Promise.all([
      supabase.from('groups').select('name').eq('id', params.id).single(),
      supabase.from('group_members').select('user_id').eq('group_id', params.id).eq('status', 'active')
    ]);
    const recipientIds = (members ?? []).map((m: any) => m.user_id).filter((id: string) => id !== user.id);
    await Promise.all(
      recipientIds.map((recipientId: string) =>
        sendPushToUser(recipientId, {
          title: `${data.author?.name ?? 'Someone'} in ${group?.name ?? 'a group'}`,
          body: image_url && !text?.trim() ? '📷 Sent a photo' : (text?.trim() || '').slice(0, 120),
          url: `/groups/${params.id}`,
          tag: `group-${params.id}`
        })
      )
    );
  })().catch(() => {});

  trackServerEvent(user.id, 'message_sent', { channel: 'group' }).catch(() => {});

  return NextResponse.json({ message: { ...data, reactions: [] } }, { status: 201 });
}
