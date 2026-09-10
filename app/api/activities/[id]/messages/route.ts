import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { sendPushToUser } from '@/lib/pushNotifications';
import { trackServerEvent } from '@/lib/analytics-server';

// GET /api/activities/[id]/messages — the group chat for one activity,
// oldest first, plus each message's aggregated reactions and the
// activity's pinned message (if any).
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // RLS already restricts this to the organizer + confirmed/waitlisted/checked-in attendees
  const { data: messages, error } = await supabase
    .from('activity_messages')
    .select('*, author:author_id ( id, name, avatar_color, avatar_url )')
    .eq('activity_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[/api/activities/[id]/messages]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  let reactionsByMessage: Record<string, { emoji: string; count: number; reactedByMe: boolean }[]> = {};
  if (messages && messages.length > 0) {
    const messageIds = messages.map((m) => m.id);
    const { data: reactions } = await supabase
      .from('activity_message_reactions')
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

  let pinnedMessage = null;
  const { data: activity } = await supabase.from('activities').select('pinned_message_id').eq('id', params.id).maybeSingle();
  if (activity?.pinned_message_id) {
    const { data: pinned } = await supabase
      .from('activity_messages')
      .select('id, text, image_url, author:author_id ( name )')
      .eq('id', activity.pinned_message_id)
      .maybeSingle();
    pinnedMessage = pinned ?? null;
  }

  return NextResponse.json({ messages: messagesWithReactions, pinnedMessage });
}

// POST /api/activities/[id]/messages — post to the group chat
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to post.' }, { status: 401 });

  const { text, image_url } = await request.json();
  if ((!text || !text.trim()) && !image_url) {
    return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
  }
  if (typeof text === 'string' && text.length > 5000) {
    return NextResponse.json({ error: 'Messages are limited to 5000 characters.' }, { status: 400 });
  }

  // RLS enforces membership — this insert fails automatically if the user
  // never RSVP'd and isn't the organizer.
  const { data, error } = await supabase
    .from('activity_messages')
    .insert({ activity_id: params.id, author_id: user.id, text: text?.trim() || '', image_url: image_url ?? null })
    .select('*, author:author_id ( id, name, avatar_color, avatar_url )')
    .single();

  if (error) {
    console.error('[/api/activities/[id]/messages]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Best-effort, fire-and-forget. Recipients: confirmed attendees plus the
  // organizer (matching who RLS actually allows into this chat), minus
  // whoever just sent the message.
  (async () => {
    const [{ data: activity }, { data: rsvps }] = await Promise.all([
      supabase.from('activities').select('title, organizer_id').eq('id', params.id).single(),
      supabase.from('rsvps').select('user_id').eq('activity_id', params.id).eq('status', 'confirmed')
    ]);
    const recipientIds = new Set([...(rsvps ?? []).map((r: any) => r.user_id), activity?.organizer_id].filter(Boolean));
    recipientIds.delete(user.id);
    await Promise.all(
      Array.from(recipientIds).map((recipientId) =>
        sendPushToUser(recipientId as string, {
          title: `${data.author?.name ?? 'Someone'} in ${activity?.title ?? 'activity chat'}`,
          body: image_url && !text?.trim() ? '📷 Sent a photo' : (text?.trim() || '').slice(0, 120),
          url: `/communities/${params.id}`,
          tag: `community-${params.id}`
        })
      )
    );
  })().catch(() => {});

  trackServerEvent(user.id, 'message_sent', { channel: 'activity' }).catch(() => {});

  return NextResponse.json({ message: { ...data, reactions: [] } }, { status: 201 });
}
