import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { DEFAULT_ACTIVITY_DURATION_MS } from '@/lib/activityTimeState';

// Relevance ranking — deliberately kept in application code rather than a
// Postgres function/view. PostgREST (what the query builder below talks to)
// can only ORDER BY real columns, not arbitrary expressions, so genuinely
// reusing Postgres for this would mean a .rpc() call to a plpgsql function —
// a pattern that doesn't exist anywhere else in this codebase. Postgres is
// still doing the real work here (ILIKE finds the right candidates); this
// just decides the order among them, which is simpler to read, adjust, and
// keep consistent across four different result shapes as one small function.
//
// Each field checked against the query gets a match tier (0 = exact,
// 1 = starts with, 2 = contains) and a field weight (lower = more important
// — e.g. a title match always outranks a description match, regardless of
// how weak the title match is). A result's score is the best
// [fieldWeight, tier] pair across all its fields; results are sorted by that
// pair ascending, so field importance is decided first and match strength
// only breaks ties within the same field.
type FieldSpec = { value: string | null | undefined; weight: number };

function bestMatch(fields: FieldSpec[], query: string): [number, number] {
  const q = query.toLowerCase();
  let best: [number, number] = [99, 99];
  for (const { value, weight } of fields) {
    if (!value) continue;
    const v = value.toLowerCase();
    let tier: number | null = null;
    if (v === q) tier = 0;
    else if (v.startsWith(q)) tier = 1;
    else if (v.includes(q)) tier = 2;
    if (tier !== null && (weight < best[0] || (weight === best[0] && tier < best[1]))) {
      best = [weight, tier];
    }
  }
  return best;
}

function rankBy<T>(items: T[], query: string, fieldsFor: (item: T) => FieldSpec[]): T[] {
  return items
    .map((item) => ({ item, score: bestMatch(fieldsFor(item), query) }))
    .sort((a, b) => a.score[0] - b.score[0] || a.score[1] - b.score[1])
    .map((x) => x.item);
}

// GET /api/search?q=... — searches activities, people, groups, and posts in
// one request (not one per tab), since the frontend's tab switching just
// filters/reslices this same response client-side rather than re-fetching.
// Each category fetches a slightly larger candidate pool (25) than it
// returns (10), so ranking has enough to work with rather than potentially
// missing a strong match that the database's own default ordering happened
// to place outside a tighter limit.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();

  if (!q) {
    // Browse mode (no query yet) — real upcoming activities and a small
    // set of people not already followed, not a placeholder empty state.
    // No relevance ranking needed here since there's no query to rank
    // against; ordering is just "soonest first" / "most recent profiles".
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - DEFAULT_ACTIVITY_DURATION_MS).toISOString();
    const notFinished = `ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${cutoffIso})`;

    const { data: upcoming } = await supabase
      .from('activities_with_availability')
      .select('id, title, description, category, cover_image_url, starts_at, ends_at, address, status, capacity, spots_remaining, profiles:organizer_id ( id, name, is_verified_organizer )')
      .eq('status', 'active')
      .or(notFinished)
      .order('starts_at', { ascending: true })
      .limit(6);

    const { data: myFollowsForBrowse } = user
      ? await supabase.from('follows').select('followed_id').eq('follower_id', user.id)
      : { data: [] as any[] };
    const alreadyFollowed = new Set((myFollowsForBrowse ?? []).map((f: any) => f.followed_id));

    const { data: suggestedPeople } = await supabase
      .from('profiles')
      .select('id, name, handle, avatar_color, avatar_url')
      .neq('id', user?.id ?? '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false })
      .limit(15);
    const filteredPeople = (suggestedPeople ?? []).filter((p: any) => !alreadyFollowed.has(p.id)).slice(0, 6);

    const browseActivityIds = (upcoming ?? []).map((a: any) => a.id);
    const { data: browseAttendeeRows } = browseActivityIds.length
      ? await supabase.from('rsvps').select('activity_id, user:user_id ( id, name, avatar_color, avatar_url )').in('activity_id', browseActivityIds).eq('status', 'confirmed')
      : { data: [] as any[] };
    const browseAttendeesByActivity = new Map<string, any[]>();
    (browseAttendeeRows ?? []).forEach((r: any) => {
      if (!r.user) return;
      const list = browseAttendeesByActivity.get(r.activity_id) ?? [];
      if (list.length < 5) list.push(r.user);
      browseAttendeesByActivity.set(r.activity_id, list);
    });

    const browsePeopleIds = filteredPeople.map((p: any) => p.id);
    const { data: browseInterestRows } = browsePeopleIds.length
      ? await supabase.from('profile_interests').select('profile_id, category:category_key ( label )').in('profile_id', browsePeopleIds)
      : { data: [] as any[] };
    const browseInterestsByPerson = new Map<string, string[]>();
    (browseInterestRows ?? []).forEach((r: any) => {
      if (!r.category) return;
      const list = browseInterestsByPerson.get(r.profile_id) ?? [];
      list.push(r.category.label);
      browseInterestsByPerson.set(r.profile_id, list);
    });

    const { data: mySavedForBrowse } = user && browseActivityIds.length
      ? await supabase.from('saved_activities').select('activity_id').eq('user_id', user.id).in('activity_id', browseActivityIds)
      : { data: [] as any[] };
    const savedActivityIds = new Set((mySavedForBrowse ?? []).map((s: any) => s.activity_id));

    return NextResponse.json({
      activities: (upcoming ?? []).map((a: any) => ({ ...a, attendees: browseAttendeesByActivity.get(a.id) ?? [], isSaved: savedActivityIds.has(a.id) })),
      people: filteredPeople.map((p: any) => ({ ...p, isFollowing: false, interests: browseInterestsByPerson.get(p.id) ?? [] })),
      groups: [],
      posts: []
    });
  }

  const pattern = `%${q}%`;

  // Activities: match on title/description/category directly, OR on the
  // organizer's name/handle. PostgREST doesn't cleanly support an OR filter
  // that spans a joined table in one query, so the organizer-name match is
  // done as its own small lookup (matching profile IDs), then merged in.
  // Excludes activities that have effectively ended — a known ends_at in
  // the past, or (no ends_at set) more than DEFAULT_ACTIVITY_DURATION_MS
  // past its starts_at. Same logic and same constant as the map's "All"
  // filter (app/api/activities/route.ts), so what counts as "finished"
  // never disagrees between the two screens.
  const nowIso = new Date().toISOString();
  const effectiveDurationCutoffIso = new Date(Date.now() - DEFAULT_ACTIVITY_DURATION_MS).toISOString();
  const notFinishedFilter = `ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${effectiveDurationCutoffIso})`;

  const [directActivities, matchingOrganizers] = await Promise.all([
    supabase
      .from('activities_with_availability')
      .select('id, title, description, category, cover_image_url, starts_at, ends_at, address, status, capacity, spots_remaining, profiles:organizer_id ( id, name, is_verified_organizer )')
      .eq('status', 'active')
      .or(`title.ilike.${pattern},description.ilike.${pattern},category.ilike.${pattern}`)
      .or(notFinishedFilter)
      .order('starts_at', { ascending: true })
      .limit(25),
    supabase.from('profiles').select('id').or(`name.ilike.${pattern},handle.ilike.${pattern}`)
  ]);

  let activities = directActivities.data ?? [];
  const organizerIds = (matchingOrganizers.data ?? []).map((p) => p.id);
  if (organizerIds.length > 0) {
    const { data: byOrganizer } = await supabase
      .from('activities_with_availability')
      .select('id, title, description, category, cover_image_url, starts_at, ends_at, address, status, capacity, spots_remaining, profiles:organizer_id ( id, name, is_verified_organizer )')
      .eq('status', 'active')
      .in('organizer_id', organizerIds)
      .or(notFinishedFilter)
      .order('starts_at', { ascending: true })
      .limit(25);
    const seen = new Set(activities.map((a: any) => a.id));
    for (const a of byOrganizer ?? []) {
      if (!seen.has(a.id)) { activities.push(a); seen.add(a.id); }
    }
  }
  // Field priority: title beats category beats organizer name beats description.
  activities = rankBy(activities, q, (a: any) => [
    { value: a.title, weight: 0 },
    { value: a.category, weight: 1 },
    { value: a.profiles?.name, weight: 2 },
    { value: a.description, weight: 3 }
  ]).slice(0, 10);

  // People
  const { data: people } = await supabase
    .from('profiles')
    .select('id, name, handle, avatar_color, avatar_url')
    .or(`name.ilike.${pattern},handle.ilike.${pattern}`)
    .neq('id', user?.id ?? '00000000-0000-0000-0000-000000000000')
    .limit(25);

  let peopleWithFollowState: any[] = rankBy(people ?? [], q, (p: any) => [
    { value: p.handle, weight: 0 },
    { value: p.name, weight: 1 }
  ]).slice(0, 10);
  if (user && peopleWithFollowState.length > 0) {
    const { data: myFollows } = await supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', user.id)
      .in('followed_id', peopleWithFollowState.map((p) => p.id));
    const followingIds = new Set((myFollows ?? []).map((f) => f.followed_id));
    peopleWithFollowState = peopleWithFollowState.map((p) => ({ ...p, isFollowing: followingIds.has(p.id) }));
  } else {
    peopleWithFollowState = peopleWithFollowState.map((p) => ({ ...p, isFollowing: false }));
  }

  // Groups — public only, matching what's discoverable elsewhere in the app
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, avatar_color, is_public, member_count:group_members(count)')
    .eq('is_public', true)
    .ilike('name', pattern)
    .limit(25);
  const groupsFormatted = rankBy(
    (groups ?? []).map((g: any) => ({ ...g, member_count: g.member_count?.[0]?.count ?? 0 })),
    q,
    (g: any) => [{ value: g.name, weight: 0 }]
  ).slice(0, 10);

  // Posts
  const { data: posts } = await supabase
    .from('posts')
    .select('id, text, image_url, image_urls, author:author_id ( id, name, avatar_color, avatar_url )')
    .not('text', 'is', null)
    .ilike('text', pattern)
    .order('created_at', { ascending: false })
    .limit(25);
  // Sort is stable, so posts tied on match tier keep their most-recent-first
  // order from the query above — recency as a free tiebreaker, not another
  // field to weight explicitly.
  const rankedPosts = rankBy(posts ?? [], q, (p: any) => [{ value: p.text, weight: 0 }]).slice(0, 10);

  // Attendee samples — one batched query for every activity in the final
  // result set, not one query per activity. Small sample (5) since this is
  // just for the overlapping-avatars preview, not a full attendee list.
  const activityIds = activities.map((a: any) => a.id);
  const { data: attendeeRows } = activityIds.length
    ? await supabase.from('rsvps').select('activity_id, user:user_id ( id, name, avatar_color, avatar_url )').in('activity_id', activityIds).eq('status', 'confirmed').limit(activityIds.length * 5)
    : { data: [] as any[] };
  const attendeesByActivity = new Map<string, any[]>();
  (attendeeRows ?? []).forEach((r: any) => {
    if (!r.user) return;
    const list = attendeesByActivity.get(r.activity_id) ?? [];
    if (list.length < 5) list.push(r.user);
    attendeesByActivity.set(r.activity_id, list);
  });
  const activitiesWithAttendees = activities.map((a: any) => ({ ...a, attendees: attendeesByActivity.get(a.id) ?? [] }));

  const { data: mySaved } = user && activityIds.length
    ? await supabase.from('saved_activities').select('activity_id').eq('user_id', user.id).in('activity_id', activityIds)
    : { data: [] as any[] };
  const savedIds = new Set((mySaved ?? []).map((s: any) => s.activity_id));
  const activitiesWithSaveState = activitiesWithAttendees.map((a: any) => ({ ...a, isSaved: savedIds.has(a.id) }));

  // Interests — same batching approach, one query for every person in the
  // final result set.
  const peopleIds = peopleWithFollowState.map((p: any) => p.id);
  const { data: interestRows } = peopleIds.length
    ? await supabase.from('profile_interests').select('profile_id, category:category_key ( key, label )').in('profile_id', peopleIds)
    : { data: [] as any[] };
  const interestsByPerson = new Map<string, string[]>();
  (interestRows ?? []).forEach((r: any) => {
    if (!r.category) return;
    const list = interestsByPerson.get(r.profile_id) ?? [];
    list.push(r.category.label);
    interestsByPerson.set(r.profile_id, list);
  });
  const peopleWithInterests = peopleWithFollowState.map((p: any) => ({ ...p, interests: interestsByPerson.get(p.id) ?? [] }));

  return NextResponse.json({
    activities: activitiesWithSaveState,
    people: peopleWithInterests,
    groups: groupsFormatted,
    posts: rankedPosts
  });
}
