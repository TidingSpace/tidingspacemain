import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { getActivityTimeState } from '@/lib/activityTimeState';

// GET /api/admin/dashboard — the overview cards + recent-activity feeds.
// Every number here comes from a real query against existing tables — none
// of this is fabricated or estimated. "Live activities" specifically reuses
// getActivityTimeState(), the same single source of truth the public app
// uses for its own LIVE badge, rather than a separate SQL approximation
// that could quietly drift out of sync with what users actually see.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayIso = startOfToday.toISOString();

  const [
    { count: totalUsers },
    { count: activeUsersToday },
    { count: activitiesToday },
    { count: groupsCount },
    { count: dmMessagesToday },
    { count: groupMessagesToday },
    { count: openReports },
    { data: recentActivitiesForLiveCheck },
    { data: timelineUsers },
    { data: timelineActivities },
    { data: timelineReports },
    { data: timelineGroups },
    { data: timelineRsvps }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_seen_at', startOfTodayIso),
    supabase.from('activities').select('*', { count: 'exact', head: true }).eq('status', 'active').gte('starts_at', startOfTodayIso),
    supabase.from('groups').select('*', { count: 'exact', head: true }),
    supabase.from('direct_messages').select('*', { count: 'exact', head: true }).gte('created_at', startOfTodayIso),
    supabase.from('group_messages').select('*', { count: 'exact', head: true }).gte('created_at', startOfTodayIso),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('activities').select('starts_at, ends_at').eq('status', 'active')
      .gte('starts_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .lte('starts_at', new Date().toISOString()),
    // Unified timeline sources — fetched separately (different tables can't
    // be UNIONed by a single Supabase query) and merged/sorted in JS below.
    supabase.from('profiles').select('id, name, created_at').order('created_at', { ascending: false }).limit(15),
    supabase.from('activities').select('id, title, created_at, organizer:organizer_id ( name )').order('created_at', { ascending: false }).limit(15),
    supabase.from('reports').select('id, reason, created_at, reporter:reporter_id ( name )').order('created_at', { ascending: false }).limit(15),
    supabase.from('groups').select('id, name, created_at, creator:creator_id ( name )').order('created_at', { ascending: false }).limit(15),
    supabase.from('rsvps').select('id, created_at, user:user_id ( name ), activity:activity_id ( title )').order('created_at', { ascending: false }).limit(15)
  ]);

  const now2 = new Date();
  const liveActivitiesCount = (recentActivitiesForLiveCheck ?? []).filter((a) => {
    const state = getActivityTimeState(a.starts_at, a.ends_at, now2);
    return state === 'in_progress' || state === 'ending_soon';
  }).length;

  // One merged, newest-first timeline — this is the "operational timeline
  // of the platform" the admin panel is meant to give at a glance, not
  // several disconnected recent-N lists.
  type TimelineEvent = { id: string; type: string; text: string; created_at: string };
  const timeline: TimelineEvent[] = [
    ...(timelineUsers ?? []).map((u: any) => ({ id: `user-${u.id}`, type: 'signup', text: `${u.name} registered`, created_at: u.created_at })),
    ...(timelineActivities ?? []).map((a: any) => ({ id: `activity-${a.id}`, type: 'activity', text: `${a.organizer?.name ?? 'Someone'} created "${a.title}"`, created_at: a.created_at })),
    ...(timelineReports ?? []).map((r: any) => ({ id: `report-${r.id}`, type: 'report', text: `${r.reporter?.name ?? 'Someone'} reported something (${r.reason})`, created_at: r.created_at })),
    ...(timelineGroups ?? []).map((g: any) => ({ id: `group-${g.id}`, type: 'group', text: `${g.creator?.name ?? 'Someone'} created group "${g.name}"`, created_at: g.created_at })),
    ...(timelineRsvps ?? []).map((r: any) => ({ id: `rsvp-${r.id}`, type: 'join', text: `${r.user?.name ?? 'Someone'} joined "${r.activity?.title ?? 'an activity'}"`, created_at: r.created_at }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 25);

  return NextResponse.json({
    stats: {
      totalUsers: totalUsers ?? 0,
      activeUsersToday: activeUsersToday ?? 0,
      activitiesToday: activitiesToday ?? 0,
      liveActivities: liveActivitiesCount,
      groups: groupsCount ?? 0,
      messagesToday: (dmMessagesToday ?? 0) + (groupMessagesToday ?? 0),
      openReports: openReports ?? 0
    },
    timeline
  });
}
