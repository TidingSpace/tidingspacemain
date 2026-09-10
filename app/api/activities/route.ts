import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { notifyFollowers } from '@/lib/notifications';
import { DEFAULT_ACTIVITY_DURATION_MS } from '@/lib/activityTimeState';
import { checkRateLimit } from '@/lib/rateLimit';
import { trackServerEvent } from '@/lib/analytics-server';

// How far into the future recurring occurrences get generated, in days.
// 180 (6 months) was chosen over a shorter window like 90 specifically
// because monthly recurrence needs enough runway to produce a meaningful
// number of instances — 90 days would only generate 3 monthly occurrences,
// which barely reads as "recurring." 180 days gives monthly ~6 instances,
// weekly ~26, and daily 180 — all comfortably finite, no infinite-future
// generation, and re-creating/extending a series past this horizon is a
// reasonable, natural point for an organizer to revisit it anyway.
const RECURRENCE_HORIZON_DAYS = 180;

type RecurrenceRule = 'daily' | 'weekly' | 'monthly';

// Generates the list of occurrence start/end times for a recurring
// activity, stepping from the first occurrence up to the horizon. Kept
// deliberately simple — plain date arithmetic, not a rule-evaluation engine
// — since every occurrence becomes its own real row (see the schema
// migration for the full reasoning), this only ever needs to run once, at
// creation time, not be re-evaluated later.
function generateOccurrences(startsAt: string, endsAt: string | null, rule: RecurrenceRule) {
  const start = new Date(startsAt);
  const durationMs = endsAt ? new Date(endsAt).getTime() - start.getTime() : null;
  const horizon = new Date(start);
  horizon.setDate(horizon.getDate() + RECURRENCE_HORIZON_DAYS);

  const occurrences: { starts_at: string; ends_at: string | null }[] = [];
  const cursor = new Date(start);

  while (cursor <= horizon) {
    const occStart = new Date(cursor);
    const occEnd = durationMs !== null ? new Date(occStart.getTime() + durationMs) : null;
    occurrences.push({ starts_at: occStart.toISOString(), ends_at: occEnd ? occEnd.toISOString() : null });

    if (rule === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (rule === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1); // 'monthly' — see note in the report about month-length edge cases
  }

  return occurrences;
}

// GET /api/activities — list active activities with live spots-remaining.
// Optional ?from=<ISO>&to=<ISO> filters to activities starting within that
// range — used by Explore's specific date filter chips (Today/Tomorrow/This Week).
// Optional ?hideFinished=true — used by Explore's "All" filter instead: unlike
// from/to (which filter on starts_at, deliberately excluding anything already
// started), this excludes only activities that have EFFECTIVELY ended —
// either a known ends_at in the past, or (no ends_at set) more than
// DEFAULT_ACTIVITY_DURATION_MS past its starts_at. This mirrors
// getEffectiveEndTime()'s logic at the SQL level, since a database query
// can't call that JS function directly — the 2-hour default is intentionally
// imported from the same constant rather than re-typed as a second magic
// number, so the map and every other screen agree on when something's over.
// Absent entirely, behavior is byte-for-byte what it always was: every
// active activity, no date filtering. This keeps every other caller of this
// endpoint (and any future one) working exactly as before; only Explore's
// own fetch was updated to pass these params.
export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const hideFinished = searchParams.get('hideFinished') === 'true';

  let query = supabase
    .from('activities_with_availability')
    .select('*, profiles:organizer_id (name, avatar_color, avatar_url, is_verified_organizer)')
    .eq('status', 'active');

  // Validated before use — an invalid/malformed date string would silently
  // produce "Invalid Date" and either match nothing or throw, neither of
  // which is the right failure mode for a filter that should just no-op if
  // it's ever passed something unexpected.
  if (from && !isNaN(Date.parse(from))) query = query.gte('starts_at', from);
  if (to && !isNaN(Date.parse(to))) query = query.lt('starts_at', to);
  if (hideFinished) {
    const nowIso = new Date().toISOString();
    const effectiveDurationCutoffIso = new Date(Date.now() - DEFAULT_ACTIVITY_DURATION_MS).toISOString();
    query = query.or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${effectiveDurationCutoffIso})`);
  }

  const { data, error } = await query
    .order('starts_at', { ascending: true })
    // Previously unbounded — as activity count grows this would fetch and
    // attempt to render every single matching row, with no ceiling. 500 is
    // comfortably above the "hundreds of activities" the map needs to
    // stay smooth with, while still preventing genuinely unbounded growth.
    // Ordering is already soonest-first, so a cap here keeps the most
    // relevant activities rather than an arbitrary slice. A fully
    // viewport-scoped fetch (only activities within the current map
    // bounds) would be the more scalable long-term approach, but that's a
    // larger, riskier change than this pass covers — noted as a real
    // follow-up, not implemented blind during a performance freeze.
    .limit(500);

  if (error) {
    console.error('[/api/activities]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ activities: data });
}

// POST /api/activities — create a new activity (must be logged in)
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'You must be logged in to create an activity.' }, { status: 401 });
  }

  // Added during a security review — this endpoint had no rate limiting at
  // all. Lower than posts/messages since creating an activity is a
  // heavier, more consequential action (it's public, persistent, and shows
  // up on the map for everyone) — 10 per hour is generous for genuine use
  // while still bounding spam/abuse.
  const allowed = await checkRateLimit(supabase, user.id, 'create_activity', 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "You're creating activities too quickly — please wait a while and try again." }, { status: 429 });
  }

  const body = await request.json();
  const {
    category, title, description, latitude, longitude,
    address, starts_at, ends_at, price_cents, capacity, cover_image_url, repeat
  } = body;

  if (!category || !title || latitude === undefined || latitude === null || longitude === undefined || longitude === null || !starts_at) {
    return NextResponse.json({ error: 'Missing required fields: category, title, location, and date/time are all required.' }, { status: 400 });
  }

  const baseRow = {
    organizer_id: user.id,
    category, title, description,
    latitude, longitude, address,
    price_cents: price_cents ?? 0,
    capacity: capacity ?? 20,
    cover_image_url: cover_image_url ?? null
  };

  const recurrenceRule: RecurrenceRule | null =
    repeat === 'daily' || repeat === 'weekly' || repeat === 'monthly' ? repeat : null;

  let rowsToInsert: Record<string, unknown>[];
  if (recurrenceRule) {
    const recurrenceGroupId = crypto.randomUUID();
    const occurrences = generateOccurrences(starts_at, ends_at ?? null, recurrenceRule);
    rowsToInsert = occurrences.map((occ) => ({
      ...baseRow,
      starts_at: occ.starts_at,
      ends_at: occ.ends_at,
      is_recurring: true,
      recurrence_group_id: recurrenceGroupId,
      recurrence_rule: recurrenceRule
    }));
  } else {
    // "Does not repeat" (or the field absent entirely) — exactly the
    // original single-row insert, unchanged.
    rowsToInsert = [{ ...baseRow, starts_at, ends_at, is_recurring: false, recurrence_group_id: null, recurrence_rule: null }];
  }

  const { data, error } = await supabase
    .from('activities')
    .insert(rowsToInsert)
    .select();

  if (error) {
    console.error('[/api/activities]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // One notification per creation action, not one per generated occurrence —
  // nobody following this organizer wants 26 "new activity" pings from a
  // single weekly-recurring activity they just created.
  const firstOccurrence = data[0];
  await notifyFollowers(supabase, { ofUserId: user.id, actorId: user.id, type: 'organizer_new_activity', activityId: firstOccurrence.id });

  // category only — never title or description, which are free text the
  // organizer wrote and could contain anything.
  trackServerEvent(user.id, 'activity_created', { category, is_recurring: !!repeat }).catch(() => {});

  return NextResponse.json({ activity: firstOccurrence, occurrencesCreated: data.length }, { status: 201 });
}
