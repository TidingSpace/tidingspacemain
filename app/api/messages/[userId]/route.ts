import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendPushToUser } from '@/lib/pushNotifications';
import { trackServerEvent } from '@/lib/analytics-server';

// GET /api/messages/[userId] — the full thread between me and userId, oldest first.
// Also marks any unread messages from them as read.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${params.userId}),and(sender_id.eq.${params.userId},recipient_id.eq.${user.id})`)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[/api/messages/[userId]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Mark incoming messages as read now that we've fetched them
  await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('sender_id', params.userId)
    .eq('recipient_id', user.id)
    .is('read_at', null);

  // The other participant's profile, so the thread header can show who this
  // actually is instead of a generic "Conversation" label.
  const { data: otherUser } = await supabase
    .from('profiles')
    .select('id, name, handle, avatar_color, avatar_url, last_seen_at, is_verified_organizer')
    .eq('id', params.userId)
    .single();

  // Whether a block exists in either direction — lets the thread show a
  // restricted-access note under my own sent messages, since those remain
  // visible to me (see the SELECT policy) but not to the recipient if
  // blocked. Uses the admin client: blocks RLS is deliberately private to
  // the blocker, so my own session can't see a block placed against me by
  // the other participant.
  const adminSupabase = createAdminClient();
  const { data: blockRows } = await adminSupabase
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${params.userId}),and(blocker_id.eq.${params.userId},blocked_id.eq.${user.id})`);
  const isBlockedEitherWay = (blockRows?.length ?? 0) > 0;

  return NextResponse.json({ messages: data, otherUser, isBlockedEitherWay });
}

// POST /api/messages/[userId] — send a message to userId
export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.id === params.userId) {
    return NextResponse.json({ error: "You can't message yourself." }, { status: 400 });
  }

  // Added during a security review — this endpoint had no rate limiting at
  // all, meaning nothing stopped an account from sending unlimited
  // messages. 30/5min is generous for genuine conversation while still
  // bounding spam.
  const allowed = await checkRateLimit(supabase, user.id, 'send_dm', 30, 300);
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
    .from('direct_messages')
    .insert({ sender_id: user.id, recipient_id: params.userId, text: text?.trim() || '', image_url: image_url ?? null })
    .select()
    .single();

  if (error) {
    console.error('[/api/messages/[userId]]', error.message);
    if (error.message.includes('row-level security')) {
      return NextResponse.json({ error: "Your account can't send messages right now." }, { status: 403 });
    }
    console.error('[/api/messages/[userId]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Skips the push notification specifically when the recipient has
  // blocked the sender (or vice versa) — the message still sends and is
  // visible to the sender (see the SELECT policy), but stays invisible to
  // the recipient, so notifying them about it would point at a
  // conversation where they'd see nothing. Uses the admin client, not the
  // sender's own session — blocks RLS is deliberately private to the
  // blocker, so the sender's own client structurally cannot see a block
  // placed against them. Scoped to exactly this one lookup.
  const adminSupabase = createAdminClient();
  const { data: blockRows } = await adminSupabase
    .from('blocks')
    .select('blocker_id')
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${params.userId}),and(blocker_id.eq.${params.userId},blocked_id.eq.${user.id})`);
  const isBlockedEitherWay = (blockRows?.length ?? 0) > 0;

  // New messages intentionally do NOT create a notification here — they
  // surface only in Messages itself (via unread counts/badges), not in the
  // Notifications center. This was tried the other way and reverted.
  // Push is a separate, new channel (added later) and isn't affected by
  // that earlier decision — best-effort, never throws, never blocks the
  // response if it fails.
  const { data: senderProfile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
  if (!isBlockedEitherWay) {
    sendPushToUser(params.userId, {
      title: senderProfile?.name ?? 'New message',
      body: image_url && !text?.trim() ? '📷 Sent a photo' : (text?.trim() || '').slice(0, 120),
      url: `/messages/${user.id}`,
      tag: `dm-${user.id}`
    }).catch(() => {});
  }

  // channel only — never message text, which could be anything.
  trackServerEvent(user.id, 'message_sent', { channel: 'dm' }).catch(() => {});

  return NextResponse.json({ message: data, isBlockedEitherWay }, { status: 201 });
}
