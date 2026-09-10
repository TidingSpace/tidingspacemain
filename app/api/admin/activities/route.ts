import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';
import { getActivityTimeState } from '@/lib/activityTimeState';

const PAGE_SIZE = 20;

// GET /api/admin/activities?query=&filter=&page=0
// filter: 'live' | 'upcoming' | 'finished' | 'reported' | undefined (all)
//
// Live/Upcoming/Finished can't be filtered as a plain SQL WHERE clause the
// way a stored column could — they're computed per-row via
// getActivityTimeState(), the same single source of truth the public app
// uses. That means this route fetches a reasonably bounded set matching
// the search/base criteria, computes state in JS, and paginates the
// filtered result afterward, rather than pushing the filter down to SQL.
// Fine at this app's current scale; would need a materialized/denormalized
// status column to stay fast if the activities table grows into the
// hundreds of thousands of rows.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') ?? '').trim();
  const filter = searchParams.get('filter') ?? 'all';
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);

  if (filter === 'reported') {
    const { data: reportedIds } = await supabase.from('reports').select('reported_activity_id').not('reported_activity_id', 'is', null);
    const ids = Array.from(new Set((reportedIds ?? []).map((r) => r.reported_activity_id)));
    if (ids.length === 0) return NextResponse.json({ activities: [], totalCount: 0 });

    let q = supabase.from('activities').select('id, title, category, starts_at, ends_at, status, organizer:organizer_id ( name )').in('id', ids);
    if (query) q = q.ilike('title', `%${query}%`);
    const { data, error } = await q.order('starts_at', { ascending: false });
    if (error) { console.error('[/api/admin/activities]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
    const paged = (data ?? []).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
    return NextResponse.json({ activities: paged, totalCount: data?.length ?? 0 });
  }

  let q = supabase.from('activities').select('id, title, category, starts_at, ends_at, status, organizer:organizer_id ( name )');
  if (query) q = q.or(`title.ilike.%${query}%,category.ilike.%${query}%`);

  const { data: allMatching, error } = await q.order('starts_at', { ascending: false });
  if (error) {
    console.error('[/api/admin/activities]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const now = new Date();
  const filtered = (allMatching ?? []).filter((a) => {
    if (a.status === 'cancelled' || a.status === 'hidden') return filter === 'all';
    const state = getActivityTimeState(a.starts_at, a.ends_at, now);
    if (filter === 'live') return state === 'in_progress' || state === 'ending_soon';
    if (filter === 'upcoming') return ['upcoming', 'soon', 'starting_soon', 'starting_very_soon', 'starting_now'].includes(state);
    if (filter === 'finished') return state === 'finished';
    return true; // 'all'
  });

  const paged = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  return NextResponse.json({ activities: paged, totalCount: filtered.length });
}
