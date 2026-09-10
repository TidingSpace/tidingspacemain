import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NEARBY_RADIUS_KM = 25;

// GET /api/posts?tab=for-you|following|nearby&lat=&lng=
// Embeds (author/activity/original) query the `posts` table directly rather
// than through a counts-computing view — PostgREST's relationship embedding
// is unreliable through views across Supabase/PostgREST versions, so counts
// are fetched separately here and merged in JS instead.
export async function GET(request: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get('tab') ?? 'for-you';
  const lat = searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : null;
  const lng = searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : null;

  const { data: { user } } = await supabase.auth.getUser();

  let authorFilter: string[] | null = null; // null = no author restriction

  if (tab === 'following') {
    if (!user) return NextResponse.json({ posts: [] }); // logged-out: nothing to show
    const { data: followRows } = await supabase.from('follows').select('followed_id').eq('follower_id', user.id);
    authorFilter = (followRows ?? []).map((f) => f.followed_id);
    if (authorFilter.length === 0) return NextResponse.json({ posts: [] });
  }

  let query = supabase
    .from('posts')
    .select(`
      *,
      author:author_id ( id, name, avatar_color, avatar_url, is_organizer, is_verified_organizer ),
      activity:activity_id ( id, title, category, cover_image_url, starts_at, ends_at, address, latitude, longitude, capacity, organizer_id ),
      original:repost_of (
        id, type, text, image_url, image_urls, created_at,
        author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (authorFilter) query = query.in('author_id', authorFilter);

  const { data: posts, error } = await query;

  if (error) {
    console.error('[/api/posts]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  if (!posts || posts.length === 0) return NextResponse.json({ posts: [] });

  let filteredPosts = posts;

  // "Nearby" — posts attached to nearby activities, OR posts by an organizer who
  // has at least one activity nearby (proxy for "nearby business": profiles have
  // no location field of their own, only activities do).
  if (tab === 'nearby') {
    if (lat === null || lng === null) {
      return NextResponse.json({ error: 'Nearby requires your location (lat/lng).' }, { status: 400 });
    }
    const { data: allActivities } = await supabase.from('activities').select('id, organizer_id, latitude, longitude');
    const nearbyActivityIds = new Set<string>();
    const nearbyOrganizerIds = new Set<string>();
    (allActivities ?? []).forEach((a) => {
      if (haversineKm(lat, lng, a.latitude, a.longitude) <= NEARBY_RADIUS_KM) {
        nearbyActivityIds.add(a.id);
        nearbyOrganizerIds.add(a.organizer_id);
      }
    });
    filteredPosts = posts.filter(
      (p: any) => (p.activity_id && nearbyActivityIds.has(p.activity_id)) || nearbyOrganizerIds.has(p.author_id)
    );
    if (filteredPosts.length === 0) return NextResponse.json({ posts: [] });
  }

  const postIds = filteredPosts.map((p) => p.id);

  const [{ data: likes }, { data: comments }, { data: reposts }] = await Promise.all([
    supabase.from('post_likes').select('post_id').in('post_id', postIds),
    supabase.from('post_comments').select('post_id').in('post_id', postIds),
    supabase.from('posts').select('repost_of').in('repost_of', postIds)
  ]);

  const countBy = (rows: any[] | null, key: string) => {
    const map = new Map<string, number>();
    (rows ?? []).forEach((r) => map.set(r[key], (map.get(r[key]) ?? 0) + 1));
    return map;
  };

  const likeCounts = countBy(likes, 'post_id');
  const commentCounts = countBy(comments, 'post_id');
  const repostCounts = countBy(reposts, 'repost_of');

  // My own reposts among these posts, if any — needed so the frontend can
  // correctly show "already reposted" (persisted, not just this session)
  // and know which specific row to delete to undo it.
  const myRepostByOriginal = new Map<string, string>();
  if (user) {
    const { data: myReposts } = await supabase
      .from('posts')
      .select('id, repost_of')
      .eq('author_id', user.id)
      .in('repost_of', postIds);
    (myReposts ?? []).forEach((r) => myRepostByOriginal.set(r.repost_of, r.id));
  }

  // Which of these posts the viewer has already liked/saved — without this,
  // the like/save buttons have no real starting state and always render as
  // "off" on load, even for posts you already liked in an earlier session.
  const myLikedIds = new Set<string>();
  const mySavedIds = new Set<string>();
  if (user) {
    const [{ data: myLikes }, { data: mySaves }] = await Promise.all([
      supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds),
      supabase.from('saved_posts').select('post_id').eq('user_id', user.id).in('post_id', postIds)
    ]);
    (myLikes ?? []).forEach((r) => myLikedIds.add(r.post_id));
    (mySaves ?? []).forEach((r) => mySavedIds.add(r.post_id));
  }

  // For posts with an attached activity, fetch spots_remaining + a small
  // attendee avatar sample for the rich activity card.
  const activityIds = Array.from(new Set(filteredPosts.map((p: any) => p.activity_id).filter(Boolean)));
  const activityExtras = new Map<string, { spots_remaining: number; attendees: any[] }>();

  if (activityIds.length > 0) {
    const { data: rsvps } = await supabase
      .from('rsvps')
      .select('activity_id, status, profile:user_id ( id, name, avatar_color, avatar_url )')
      .in('activity_id', activityIds)
      .eq('status', 'confirmed');

    const byActivity = new Map<string, any[]>();
    (rsvps ?? []).forEach((r: any) => {
      if (!byActivity.has(r.activity_id)) byActivity.set(r.activity_id, []);
      byActivity.get(r.activity_id)!.push(r.profile);
    });

    filteredPosts.forEach((p: any) => {
      if (!p.activity_id || activityExtras.has(p.activity_id)) return;
      const confirmed = byActivity.get(p.activity_id) ?? [];
      activityExtras.set(p.activity_id, {
        spots_remaining: Math.max((p.activity?.capacity ?? 0) - confirmed.length, 0),
        attendees: confirmed.slice(0, 3)
      });
    });
  }

  const postsWithCounts = filteredPosts.map((p: any) => ({
    ...p,
    like_count: likeCounts.get(p.id) ?? 0,
    comment_count: commentCounts.get(p.id) ?? 0,
    repost_count: repostCounts.get(p.id) ?? 0,
    my_repost_id: myRepostByOriginal.get(p.id) ?? null,
    liked_by_me: myLikedIds.has(p.id),
    saved_by_me: mySavedIds.has(p.id),
    activity_extras: p.activity_id ? activityExtras.get(p.activity_id) : null
  }));

  return NextResponse.json({ posts: postsWithCounts });
}

// POST /api/posts — create a text post, image post, or repost (must be logged in)
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'You must be logged in to post.' }, { status: 401 });
  }

  const allowed = await checkRateLimit(supabase, user.id, 'create_post', 10, 300); // 10 per 5 minutes
  if (!allowed) {
    return NextResponse.json({ error: "You're posting too quickly — please wait a few minutes and try again." }, { status: 429 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { type, text, image_url, image_urls, activity_id, repost_of } = body;

  if (type === 'repost' && !repost_of) {
    return NextResponse.json({ error: 'repost_of is required for a repost.' }, { status: 400 });
  }
  if (type !== 'repost' && !text && !image_url && !(Array.isArray(image_urls) && image_urls.length > 0)) {
    return NextResponse.json({ error: 'A post needs text or an image.' }, { status: 400 });
  }
  // Matches the Create Post screen's own client-side limit — enforced here
  // too since that limit was previously UI-only and trivially bypassed by
  // calling this endpoint directly.
  if (typeof text === 'string' && text.length > 2000) {
    return NextResponse.json({ error: 'Posts are limited to 2000 characters.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: user.id,
      type: type ?? 'text',
      text: text ?? null,
      image_url: image_url ?? null,
      image_urls: Array.isArray(image_urls) ? image_urls : [],
      activity_id: activity_id ?? null,
      repost_of: repost_of ?? null
    })
    .select()
    .single();

  if (error) {
    console.error('[/api/posts]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ post: data }, { status: 201 });
}
