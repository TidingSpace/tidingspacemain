import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/profiles/[userId] — everything a profile page needs in one call:
// the person's info, their posts, activities they organize, follower count,
// and whether the current viewer follows them.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user: viewer } } = await supabase.auth.getUser();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', params.userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  const { data: blockRow } = viewer && viewer.id !== params.userId
    ? await supabase.from('blocks').select('blocker_id').eq('blocker_id', viewer.id).eq('blocked_id', params.userId).maybeSingle()
    : { data: null };
  const isBlockedByViewer = !!blockRow;

  const { data: rawPosts } = await supabase
    .from('posts')
    .select(`
      *,
      author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer ),
      activity:activity_id ( id, title, category, cover_image_url, starts_at, address, capacity ),
      original:repost_of (
        id, type, text, image_url, image_urls, created_at,
        author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer )
      )
    `)
    .eq('author_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(30);

  let posts: any[] = [];
  if (rawPosts && rawPosts.length > 0) {
    const postIds = rawPosts.map((p) => p.id);
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

    // Which of these posts the viewer (not necessarily the profile owner —
    // could be anyone looking at this profile) has already liked/saved.
    const myLikedIds = new Set<string>();
    const mySavedIds = new Set<string>();
    if (viewer) {
      const [{ data: myLikes }, { data: mySaves }] = await Promise.all([
        supabase.from('post_likes').select('post_id').eq('user_id', viewer.id).in('post_id', postIds),
        supabase.from('saved_posts').select('post_id').eq('user_id', viewer.id).in('post_id', postIds)
      ]);
      (myLikes ?? []).forEach((r) => myLikedIds.add(r.post_id));
      (mySaves ?? []).forEach((r) => mySavedIds.add(r.post_id));
    }

    // Same activity_extras (spots_remaining + attendee sample) that Feed's
    // rich activity card needs — computed here too, so Profile's posts can
    // use the exact same PostListItem/ActivityPostCard components as Feed.
    const activityIds = Array.from(new Set(rawPosts.map((p: any) => p.activity_id).filter(Boolean)));
    const activityExtras = new Map<string, { spots_remaining: number; attendees: any[] }>();
    if (activityIds.length > 0) {
      const { data: rsvps } = await supabase
        .from('rsvps')
        .select('activity_id, profile:user_id ( id, name, avatar_color, avatar_url )')
        .in('activity_id', activityIds)
        .eq('status', 'confirmed');
      const byActivity = new Map<string, any[]>();
      (rsvps ?? []).forEach((r: any) => {
        if (!byActivity.has(r.activity_id)) byActivity.set(r.activity_id, []);
        byActivity.get(r.activity_id)!.push(r.profile);
      });
      rawPosts.forEach((p: any) => {
        if (!p.activity_id || activityExtras.has(p.activity_id)) return;
        const confirmed = byActivity.get(p.activity_id) ?? [];
        activityExtras.set(p.activity_id, {
          spots_remaining: Math.max((p.activity?.capacity ?? 0) - confirmed.length, 0),
          attendees: confirmed.slice(0, 3)
        });
      });
    }

    posts = rawPosts.map((p) => ({
      ...p,
      like_count: likeCounts.get(p.id) ?? 0,
      comment_count: commentCounts.get(p.id) ?? 0,
      repost_count: repostCounts.get(p.id) ?? 0,
      liked_by_me: myLikedIds.has(p.id),
      saved_by_me: mySavedIds.has(p.id),
      activity_extras: p.activity_id ? (activityExtras.get(p.activity_id) ?? null) : null
    }));
  }

  const { data: organizing } = await supabase
    .from('activities_with_availability')
    .select('*')
    .eq('organizer_id', params.userId)
    .eq('status', 'active')
    .order('starts_at', { ascending: true });

  const { count: followerCount } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('followed_id', params.userId);

  const { count: followingCount } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', params.userId);

  const { data: interestRows } = await supabase
    .from('profile_interests')
    .select('category:category_key ( key, label, icon )')
    .eq('profile_id', params.userId);
  const interests = (interestRows ?? []).map((r: any) => r.category).filter(Boolean);

  let isFollowing = false;
  if (viewer) {
    const { data: followRow } = await supabase
      .from('follows')
      .select('*')
      .eq('follower_id', viewer.id)
      .eq('followed_id', params.userId)
      .maybeSingle();
    isFollowing = !!followRow;
  }

  return NextResponse.json({
    profile,
    posts: posts ?? [],
    organizing: organizing ?? [],
    followerCount: followerCount ?? 0,
    followingCount: followingCount ?? 0,
    interests,
    isFollowing,
    isBlockedByViewer,
    isOwnProfile: viewer?.id === params.userId
  });
}

// PATCH /api/profiles/[userId] — edit your own profile (name, bio). Can't edit anyone else's.
export async function PATCH(request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== params.userId) {
    return NextResponse.json({ error: 'You can only edit your own profile.' }, { status: 403 });
  }

  const { name, bio, handle, avatar_url, activity_reminders_enabled, email_notifications_enabled, time_format_24h } = await request.json();
  const updates: Record<string, string | boolean | null> = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof bio === 'string') updates.bio = bio.trim();
  // avatar_url is intentionally allowed to be explicitly set to null (removing
  // the photo), unlike name/bio which only update when given a real value.
  if (typeof avatar_url === 'string' || avatar_url === null) updates.avatar_url = avatar_url;
  if (typeof activity_reminders_enabled === 'boolean') updates.activity_reminders_enabled = activity_reminders_enabled;
  if (typeof email_notifications_enabled === 'boolean') updates.email_notifications_enabled = email_notifications_enabled;
  if (typeof time_format_24h === 'boolean') updates.time_format_24h = time_format_24h;

  if (typeof handle === 'string') {
    // Normalize: strip a leading "@" if someone types it, lowercase to match
    // the auto-generated convention (see handle_new_user() in schema.sql),
    // and trim whitespace before validating shape.
    const normalized = handle.trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
      return NextResponse.json({ error: 'Usernames must be 3–20 characters: lowercase letters, numbers, and underscores only.' }, { status: 400 });
    }
    updates.handle = normalized;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', params.userId)
    .select()
    .single();

  if (error) {
    // Postgres unique_violation — handle already exists on the `unique`
    // constraint. Caught specifically here since the raw DB error message
    // ("duplicate key value violates unique constraint...") isn't something
    // to show someone trying to pick a username.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
    }
    console.error('[/api/profiles/[userId]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
