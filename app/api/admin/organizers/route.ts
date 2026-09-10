import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { getActivityTimeState } from '@/lib/activityTimeState';

// GET /api/admin/organizers — every organizer (anyone who has created at
// least one activity), ranked by activities created. All numbers are real
// counts, computed from actual rows — no estimation.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, organizer_id, status, starts_at, ends_at, capacity, organizer:organizer_id ( id, name, handle, avatar_color, avatar_url, is_verified_organizer )');

  if (error) { console.error('[/api/admin/organizers]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

  const activityIds = (activities ?? []).map((a) => a.id);
  const { data: rsvpRows } = activityIds.length
    ? await supabase.from('rsvps').select('activity_id').in('activity_id', activityIds).in('status', ['confirmed', 'checked_in'])
    : { data: [] };

  const joinsByActivity = new Map<string, number>();
  (rsvpRows ?? []).forEach((r) => joinsByActivity.set(r.activity_id, (joinsByActivity.get(r.activity_id) ?? 0) + 1));

  const now = new Date();
  const byOrganizer = new Map<string, any>();
  (activities ?? []).forEach((a: any) => {
    if (!a.organizer) return;
    const orgId = a.organizer_id;
    if (!byOrganizer.has(orgId)) {
      byOrganizer.set(orgId, {
        id: orgId, name: a.organizer.name, handle: a.organizer.handle, avatar_color: a.organizer.avatar_color, avatar_url: a.organizer.avatar_url,
        is_verified_organizer: a.organizer.is_verified_organizer ?? false,
        activitiesCreated: 0, upcomingCount: 0, liveCount: 0, cancelledCount: 0, totalJoins: 0
      });
    }
    const org = byOrganizer.get(orgId);
    org.activitiesCreated += 1;
    org.totalJoins += joinsByActivity.get(a.id) ?? 0;
    if (a.status === 'cancelled') org.cancelledCount += 1;
    else if (a.status === 'active') {
      const state = getActivityTimeState(a.starts_at, a.ends_at, now);
      if (state === 'in_progress' || state === 'ending_soon') org.liveCount += 1;
      else if (!['finished'].includes(state)) org.upcomingCount += 1;
    }
  });

  const organizers = Array.from(byOrganizer.values()).sort((a, b) => b.activitiesCreated - a.activitiesCreated);
  return NextResponse.json({ organizers });
}
