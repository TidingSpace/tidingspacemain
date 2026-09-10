import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/notifications — the full, real list for the Notifications screen.
// Three things happen here beyond a plain fetch:
// 1. "activity_saved" rows get aggregated into one "N people saved..." item
//    per activity, instead of showing every single save as its own row.
// 2. "Your activity starts soon" is computed live from your own upcoming
//    RSVPs — it's not a stored row, since we have no scheduled-job
//    infrastructure to generate it in advance.
// 3. Opening this endpoint marks everything as read (unread badges elsewhere
//    use the separate /unread-count endpoint, which never marks anything read).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: rawRows, error } = await supabase
    .from('notifications')
    .select(`
      *,
      actor:actor_id ( id, name, avatar_color, avatar_url ),
      activity:activity_id ( id, title, category, starts_at, address, cover_image_url ),
      group:group_id ( id, name, avatar_color, is_public ),
      post:post_id ( id, text, image_url, image_urls ),
      broadcast:broadcast_id ( id, title, message, notification_type )
    `)
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[/api/notifications]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // group_invite notifications need to reflect whatever was actually decided
  // (accepted/declined/still pending) on reload — otherwise the buttons
  // would reappear every time the page loads, since a notification row on
  // its own has no memory of being responded to. One batched lookup against
  // group_members for every group_invite in this page, keyed by group_id.
  const inviteGroupIds = (rawRows ?? []).filter((r) => r.type === 'group_invite' && r.group_id).map((r) => r.group_id);
  let statusByGroupId: Record<string, string> = {};
  if (inviteGroupIds.length > 0) {
    const { data: myMemberRows } = await supabase
      .from('group_members')
      .select('group_id, status')
      .eq('user_id', user.id)
      .in('group_id', inviteGroupIds);
    statusByGroupId = Object.fromEntries((myMemberRows ?? []).map((m) => [m.group_id, m.status]));
  }
  const rowsWithInviteStatus = (rawRows ?? []).map((row) =>
    row.type === 'group_invite' ? { ...row, groupMemberStatus: statusByGroupId[row.group_id] ?? 'pending' } : row
  );

  // Same pattern as group_invite just above — a plain notification row has
  // no memory of being responded to, so activity_invite notifications need
  // the real, persisted status from activity_invites to correctly show
  // Accept/Decline vs. Accepted/Declined after a reload.
  //
  // But activity_invites has only ONE row per (activity, invitee) — it's
  // the CURRENT state, reused and reset across re-invites, not a history.
  // If someone declines and then gets re-invited to the same activity,
  // there are now two notification rows for the same activity_id, and a
  // naive "look up status by activity_id" would apply the CURRENT status
  // (now reset to pending) to BOTH of them — incorrectly reopening the
  // old, already-declined notification too. Only the most recent
  // notification per activity_id should ever reflect the live status;
  // any older one is structurally guaranteed to represent a prior
  // decline (that's the only way a second notification could exist),
  // so it stays frozen as declined regardless of what happens later.
  const inviteRows = (rawRows ?? []).filter((r) => r.type === 'activity_invite' && r.activity_id);
  const latestInviteNotificationIdByActivity: Record<string, string> = {};
  for (const row of inviteRows) {
    const current = latestInviteNotificationIdByActivity[row.activity_id];
    if (!current || new Date(row.created_at) > new Date(inviteRows.find((r) => r.id === current)!.created_at)) {
      latestInviteNotificationIdByActivity[row.activity_id] = row.id;
    }
  }
  const inviteActivityIds = inviteRows.map((r) => r.activity_id);
  let activityInviteStatusById: Record<string, string> = {};
  if (inviteActivityIds.length > 0) {
    const { data: myInviteRows } = await supabase
      .from('activity_invites')
      .select('activity_id, status')
      .eq('invitee_id', user.id)
      .in('activity_id', inviteActivityIds);
    activityInviteStatusById = Object.fromEntries((myInviteRows ?? []).map((r) => [r.activity_id, r.status]));
  }
  const rowsWithAllInviteStatus = rowsWithInviteStatus.map((row) => {
    if (row.type !== 'activity_invite') return row;
    const isLatestForThisActivity = latestInviteNotificationIdByActivity[row.activity_id] === row.id;
    return {
      ...row,
      activityInviteStatus: isLatestForThisActivity ? (activityInviteStatusById[row.activity_id] ?? 'pending') : 'declined'
    };
  });

  // Aggregate activity_saved rows by activity_id
  const savedGroups = new Map<string, any[]>();
  const otherRows: any[] = [];
  for (const row of rowsWithAllInviteStatus) {
    if (row.type === 'activity_saved' && row.activity_id) {
      if (!savedGroups.has(row.activity_id)) savedGroups.set(row.activity_id, []);
      savedGroups.get(row.activity_id)!.push(row);
    } else {
      otherRows.push(row);
    }
  }
  const aggregatedSaved = Array.from(savedGroups.entries()).map(([activityId, rows]) => ({
    id: `agg-saved-${activityId}`,
    type: 'activity_saved_aggregate',
    count: rows.length,
    activity: rows[0].activity,
    actors_sample: rows.slice(0, 6).map((r) => r.actor).filter(Boolean),
    created_at: rows[0].created_at, // rows are already sorted desc, so [0] is most recent
    read_at: rows.every((r) => r.read_at) ? rows[0].read_at : null
  }));

  const combined = [...otherRows, ...aggregatedSaved].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Dynamic "starts soon" reminder — computed live, not stored, since there's
  // no scheduled-job infrastructure to generate it ahead of time. Gated on the
  // user's Activity Reminders preference (Settings page).
  const { data: myProfile } = await supabase.from('profiles').select('activity_reminders_enabled').eq('id', user.id).single();

  let startingSoon: any[] = [];
  if (myProfile?.activity_reminders_enabled !== false) {
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { data: upcomingRsvps } = await supabase
      .from('rsvps')
      .select('activity:activity_id ( id, title, category, starts_at, address, cover_image_url )')
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'checked_in']);

    startingSoon = (upcomingRsvps ?? [])
      .map((r: any) => r.activity)
      .filter((a: any) => a && a.starts_at > new Date().toISOString() && a.starts_at <= oneHourFromNow)
      .map((a: any) => ({
        id: `reminder-${a.id}`,
        type: 'activity_reminder',
        activity: a,
        created_at: new Date().toISOString(),
        read_at: new Date().toISOString() // reminders are always "read" — they're not a stored unread item
      }));
  }

  // Mark everything as read now that it's been fetched (fire-and-forget,
  // doesn't block the response)
  supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null)
    .then(() => {});

  return NextResponse.json({ notifications: [...startingSoon, ...combined] });
}
