import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/communities — every activity's group chat you're part of,
// either because you organize it or you RSVP'd, with the last message as a preview.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Activities I organize
  const { data: organizing } = await supabase
    .from('activities')
    .select('id, title, category')
    .eq('organizer_id', user.id);

  // Activities I RSVP'd to (any active status)
  const { data: rsvpRows } = await supabase
    .from('rsvps')
    .select('activity_id, activities:activity_id ( id, title, category )')
    .eq('user_id', user.id)
    .in('status', ['confirmed', 'waitlisted', 'checked_in']);

  const attending = (rsvpRows ?? [])
    .map((r: any) => r.activities)
    .filter(Boolean);

  const allActivities = [...(organizing ?? []), ...attending];
  const uniqueById = new Map(allActivities.map((a: any) => [a.id, a]));
  const activityIds = Array.from(uniqueById.keys());

  // Last message per activity, for the preview line — one batched query instead
  // of one query per activity. Since results come back ordered newest-first,
  // the first row we see for a given activity_id is its most recent message.
  const lastMessageByActivity = new Map<string, { text: string; created_at: string }>();
  if (activityIds.length > 0) {
    const { data: recentMessages } = await supabase
      .from('activity_messages')
      .select('activity_id, text, created_at')
      .in('activity_id', activityIds)
      .order('created_at', { ascending: false });

    for (const m of recentMessages ?? []) {
      if (!lastMessageByActivity.has(m.activity_id)) {
        lastMessageByActivity.set(m.activity_id, m);
      }
    }
  }

  const communities = Array.from(uniqueById.values()).map((activity: any) => {
    const lastMsg = lastMessageByActivity.get(activity.id);
    return {
      activity,
      lastMessage: lastMsg?.text ?? null,
      lastAt: lastMsg?.created_at ?? null
    };
  });

  communities.sort((a, b) => {
    if (!a.lastAt) return 1;
    if (!b.lastAt) return -1;
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
  });

  return NextResponse.json({ communities });
}
