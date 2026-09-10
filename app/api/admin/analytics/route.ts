import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

const DAYS = 30;

// GET /api/admin/analytics — daily counts for the last 30 days, computed
// from real rows (profiles.created_at, activities.created_at, rsvps.created_at,
// direct_messages+group_messages.created_at, groups.created_at). No
// estimation or synthetic data — every point is a genuine count query.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: users }, { data: activities }, { data: rsvps },
    { data: dms }, { data: groupMsgs }, { data: groups }
  ] = await Promise.all([
    supabase.from('profiles').select('created_at').gte('created_at', since),
    supabase.from('activities').select('created_at').gte('created_at', since),
    supabase.from('rsvps').select('created_at').gte('created_at', since),
    supabase.from('direct_messages').select('created_at').gte('created_at', since),
    supabase.from('group_messages').select('created_at').gte('created_at', since),
    supabase.from('groups').select('created_at').gte('created_at', since)
  ]);

  function bucketByDay(rows: { created_at: string }[] | null): Record<string, number> {
    const buckets: Record<string, number> = {};
    (rows ?? []).forEach((r) => {
      const day = r.created_at.slice(0, 10); // YYYY-MM-DD
      buckets[day] = (buckets[day] ?? 0) + 1;
    });
    return buckets;
  }

  // A dense day-by-day series, not just the days that happen to have data —
  // otherwise a day with zero signups would just be missing from the
  // series instead of correctly showing as zero.
  const days: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }

  const series = (buckets: Record<string, number>) => days.map((day) => ({ day, count: buckets[day] ?? 0 }));

  // DAU/MAU — current snapshot numbers, not historical trend lines. This
  // is a deliberate, honest limitation: last_seen_at is a single column
  // that gets overwritten every time someone is active, not a log of every
  // day they were active. That means "how many users were active on day
  // X, two weeks ago" genuinely cannot be reconstructed from it — someone
  // active on day 5 AND today would show last_seen_at = today, silently
  // erasing day 5 from any attempt at a historical count. A true DAU trend
  // would need a dedicated daily activity log table, not this column.
  // What IS honestly computable: how many users are active right now,
  // within the last 24h (DAU) or last 30d (MAU) — real, current numbers.
  const [{ count: dauCount }, { count: mauCount }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_seen_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('last_seen_at', since)
  ]);

  // Top categories — real counts from activities actually created.
  const { data: categoryRows } = await supabase.from('activities').select('category').gte('created_at', since);
  const categoryCounts = new Map<string, number>();
  (categoryRows ?? []).forEach((r) => categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1));
  const topCategories = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([category, count]) => ({ category, count }));

  // Most active organizers — ranked by activities created in this window,
  // same underlying data as the dedicated Organizers page, just the top
  // slice of it surfaced here for a quick glance.
  const { data: organizerRows } = await supabase.from('activities').select('organizer_id, organizer:organizer_id ( name, handle )').gte('created_at', since);
  const organizerCounts = new Map<string, { name: string; handle: string; count: number }>();
  (organizerRows ?? []).forEach((r: any) => {
    if (!r.organizer) return;
    if (!organizerCounts.has(r.organizer_id)) organizerCounts.set(r.organizer_id, { name: r.organizer.name, handle: r.organizer.handle, count: 0 });
    organizerCounts.get(r.organizer_id)!.count += 1;
  });
  const topOrganizers = Array.from(organizerCounts.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count).slice(0, 8);

  return NextResponse.json({
    newUsers: series(bucketByDay(users)),
    activitiesCreated: series(bucketByDay(activities)),
    activitiesJoined: series(bucketByDay(rsvps)),
    messagesSent: series(bucketByDay([...(dms ?? []), ...(groupMsgs ?? [])])),
    groupsCreated: series(bucketByDay(groups)),
    dau: dauCount ?? 0,
    mau: mauCount ?? 0,
    topCategories,
    topOrganizers
    // TODO — Returning Users and a real historical DAU trend both need a
    // dedicated daily activity log (e.g. a table recording one row per
    // user per active day), which doesn't exist yet. Neither is fabricated
    // here; both are simply not included rather than estimated.
  });
}
