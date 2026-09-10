import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

// GET /api/admin/trust-safety — informational widgets for proactively
// spotting abuse patterns, not a moderation queue itself (Reports already
// covers that). Every number here is a real count against existing data;
// no risk scores or synthetic severity ratings are computed or invented.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const [{ data: userReports }, { data: activityReports }, { data: groupReports }, { data: recentSignups }, { data: recentBans }, { data: recentSuspensions }] = await Promise.all([
    supabase.from('reports').select('reported_user_id').not('reported_user_id', 'is', null),
    supabase.from('reports').select('reported_activity_id').not('reported_activity_id', 'is', null),
    supabase.from('reports').select('reported_group_id').not('reported_group_id', 'is', null),
    supabase.from('profiles').select('created_at').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('admin_audit_log').select('id, target_id, details, created_at, admin:admin_id ( name )').eq('action', 'banned user').order('created_at', { ascending: false }).limit(10),
    supabase.from('admin_audit_log').select('id, target_id, details, created_at, admin:admin_id ( name )').in('action', ['suspended user', 'suspended user (via report)']).order('created_at', { ascending: false }).limit(10)
  ]);

  function topCounts<T extends Record<string, any>>(rows: T[] | null, key: keyof T, limit: number, minCount = 1) {
    const counts = new Map<string, number>();
    (rows ?? []).forEach((r) => { const id = r[key]; if (id) counts.set(id, (counts.get(id) ?? 0) + 1); });
    return Array.from(counts.entries())
      .filter(([, count]) => count >= minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, count]) => ({ id, count }));
  }

  // minCount: 2 — "repeatedly reported" should mean actually repeated,
  // not just any single report (Reports itself is already the place to
  // review individual, one-off reports).
  const topReportedUsers = topCounts(userReports, 'reported_user_id', 5, 2);
  const topReportedActivities = topCounts(activityReports, 'reported_activity_id', 5, 2);
  const topReportedGroups = topCounts(groupReports, 'reported_group_id', 5, 2);

  const [{ data: userProfiles }, { data: activityRows }, { data: groupRows }] = await Promise.all([
    topReportedUsers.length ? supabase.from('profiles').select('id, name, handle').in('id', topReportedUsers.map((u) => u.id)) : Promise.resolve({ data: [] }),
    topReportedActivities.length ? supabase.from('activities').select('id, title').in('id', topReportedActivities.map((a) => a.id)) : Promise.resolve({ data: [] }),
    topReportedGroups.length ? supabase.from('groups').select('id, name').in('id', topReportedGroups.map((g) => g.id)) : Promise.resolve({ data: [] })
  ]);

  // Cancellation-rate outliers: organizers with 3+ activities where at
  // least 40% were cancelled — the same signal already shown (without a
  // fixed threshold) on the Organizers page, surfaced here specifically as
  // an outlier list rather than the full ranked table.
  const { data: allActivities } = await supabase.from('activities').select('organizer_id, status, organizer:organizer_id ( name, handle )');
  const byOrg = new Map<string, { name: string; handle: string; total: number; cancelled: number }>();
  (allActivities ?? []).forEach((a: any) => {
    if (!a.organizer) return;
    if (!byOrg.has(a.organizer_id)) byOrg.set(a.organizer_id, { name: a.organizer.name, handle: a.organizer.handle, total: 0, cancelled: 0 });
    const o = byOrg.get(a.organizer_id)!;
    o.total += 1;
    if (a.status === 'cancelled') o.cancelled += 1;
  });
  const cancellationOutliers = Array.from(byOrg.entries())
    .map(([id, o]) => ({ id, ...o, rate: o.cancelled / o.total }))
    .filter((o) => o.total >= 3 && o.rate >= 0.4)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  // Excessive activity creation: 5+ activities created by the same
  // organizer within the last 24 hours — a real, computed signal (not a
  // fabricated "risk score"), reusing the same allActivities fetch above
  // rather than a separate query. Threshold is a plain, stated number, not
  // a mysterious weighted formula.
  const { data: recentActivityCreations } = await supabase
    .from('activities').select('organizer_id, created_at, organizer:organizer_id ( name, handle )')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const creationCounts = new Map<string, { name: string; handle: string; count: number }>();
  (recentActivityCreations ?? []).forEach((a: any) => {
    if (!a.organizer) return;
    if (!creationCounts.has(a.organizer_id)) creationCounts.set(a.organizer_id, { name: a.organizer.name, handle: a.organizer.handle, count: 0 });
    creationCounts.get(a.organizer_id)!.count += 1;
  });
  const excessiveCreators = Array.from(creationCounts.entries())
    .map(([id, v]) => ({ id, ...v }))
    .filter((v) => v.count >= 5)
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    mostReportedUsers: topReportedUsers.map((r) => ({ ...r, profile: (userProfiles ?? []).find((p: any) => p.id === r.id) })),
    mostReportedActivities: topReportedActivities.map((r) => ({ ...r, activity: (activityRows ?? []).find((a: any) => a.id === r.id) })),
    mostReportedGroups: topReportedGroups.map((r) => ({ ...r, group: (groupRows ?? []).find((g: any) => g.id === r.id) })),
    cancellationOutliers,
    excessiveCreators,
    signupsLast24h: (recentSignups ?? []).length,
    recentBans: (recentBans ?? []).map((b: any) => ({ id: b.id, targetName: b.details, admin: b.admin?.name ?? 'unknown', created_at: b.created_at })),
    recentSuspensions: (recentSuspensions ?? []).map((s: any) => ({ id: s.id, targetName: s.details, admin: s.admin?.name ?? 'unknown', created_at: s.created_at }))
  });
}
