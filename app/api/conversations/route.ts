import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/conversations — list everyone you've exchanged DMs with,
// most recent conversation first, with the last message as a preview and a
// real unread count (not just a boolean) for the mockup's numbered badge.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // RLS already restricts this to messages where I'm sender or recipient
  const { data, error } = await supabase
    .from('direct_messages')
    .select(`
      id, text, created_at, read_at, sender_id, recipient_id,
      sender:sender_id ( id, name, avatar_color, avatar_url, last_seen_at, is_verified_organizer ),
      recipient:recipient_id ( id, name, avatar_color, avatar_url, last_seen_at, is_verified_organizer )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[/api/conversations]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Collapse into one row per conversation partner: most recent message as
  // preview, plus a running count of unread messages FROM them.
  const byPartner = new Map<string, any>();
  for (const m of data ?? []) {
    const isSender = m.sender_id === user.id;
    const partner = isSender ? m.recipient : m.sender;
    const partnerId = isSender ? m.recipient_id : m.sender_id;
    const incomingUnread = !isSender && !m.read_at;

    if (!byPartner.has(partnerId)) {
      byPartner.set(partnerId, {
        partner,
        lastMessage: m.text,
        lastAt: m.created_at,
        unread: incomingUnread,
        unreadCount: incomingUnread ? 1 : 0
      });
    } else if (incomingUnread) {
      byPartner.get(partnerId).unreadCount += 1;
      byPartner.get(partnerId).unread = true;
    }
  }

  return NextResponse.json({ conversations: Array.from(byPartner.values()) });
}
