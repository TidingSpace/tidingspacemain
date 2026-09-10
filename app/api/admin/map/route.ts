import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

// GET /api/admin/map — every activity with a location, regardless of
// status (unlike the public map, which only ever shows status='active').
// Admins need to see hidden/cancelled activities on this map too, since
// the whole point of this page is "what's actually happening on the
// platform," including things a public user would never see.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { data: activities, error } = await supabase
    .from('activities')
    .select('id, title, category, latitude, longitude, starts_at, ends_at, status, is_recurring, capacity, organizer:organizer_id ( name )')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    // Previously unbounded, and worse than the public map's equivalent
    // issue: this deliberately includes every status (hidden/cancelled/
    // finished too), so the response would keep growing indefinitely as
    // historical activities accumulate, not just with current activity
    // count. Most-recent-first plus a cap keeps the existing "Show
    // finished" toggle meaningful (still plenty of recent history to look
    // at) without the response growing forever.
    .order('starts_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('[/api/admin/map]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Which of these have an open report against them — computed once here
  // rather than making the frontend cross-reference two separate fetches.
  const activityIds = (activities ?? []).map((a) => a.id);
  const { data: reportedRows } = activityIds.length
    ? await supabase.from('reports').select('reported_activity_id').in('reported_activity_id', activityIds).eq('status', 'open')
    : { data: [] };
  const reportedIds = new Set((reportedRows ?? []).map((r) => r.reported_activity_id));

  const enriched = (activities ?? []).map((a) => ({ ...a, reported: reportedIds.has(a.id) }));
  return NextResponse.json({ activities: enriched });
}
