-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Closes the gap where "block" only actually stopped direct messages.
-- Extends blocking (bidirectionally — either direction blocks the
-- interaction) to: Feed/Search/Profile post visibility, Explore/Search
-- activity visibility, commenting on posts and activities, following,
-- RSVPing to a blocked-relative-to-organizer activity, and joining or being
-- added to a blocked-relative-to-creator group.
--
-- Safe to run whether or not any of this was partially applied before —
-- every policy is dropped and recreated, and the blocks table itself uses
-- IF NOT EXISTS.

create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

alter table blocks enable row level security;

drop policy if exists "blocks_select_own" on blocks;
create policy "blocks_select_own" on blocks for select using (auth.uid() = blocker_id);
drop policy if exists "blocks_insert_own" on blocks;
create policy "blocks_insert_own" on blocks for insert with check (auth.uid() = blocker_id);
drop policy if exists "blocks_delete_own" on blocks;
create policy "blocks_delete_own" on blocks for delete using (auth.uid() = blocker_id);

-- Activities
drop policy if exists "activities_select_all" on activities;
drop policy if exists "activities_select_not_blocked" on activities;
create policy "activities_select_not_blocked" on activities for select using (
  not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = organizer_id)
       or (blocker_id = organizer_id and blocked_id = auth.uid())
  )
);

-- RSVPs
drop policy if exists "rsvps_insert_own" on rsvps;
create policy "rsvps_insert_own" on rsvps for insert with check (
  auth.uid() = user_id
  and not exists (
    select 1 from blocks b
    join activities a on a.id = rsvps.activity_id
    where (b.blocker_id = auth.uid() and b.blocked_id = a.organizer_id)
       or (b.blocker_id = a.organizer_id and b.blocked_id = auth.uid())
  )
);

-- Follows
drop policy if exists "follows_insert_own" on follows;
create policy "follows_insert_own" on follows for insert with check (
  auth.uid() = follower_id
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = followed_id)
       or (blocker_id = followed_id and blocked_id = auth.uid())
  )
);

-- Posts
drop policy if exists "posts_select_all" on posts;
drop policy if exists "posts_select_not_blocked" on posts;
create policy "posts_select_not_blocked" on posts for select using (
  not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = author_id)
       or (blocker_id = author_id and blocked_id = auth.uid())
  )
);

-- Post comments
drop policy if exists "post_comments_select_all" on post_comments;
drop policy if exists "post_comments_select_not_blocked" on post_comments;
create policy "post_comments_select_not_blocked" on post_comments for select using (
  not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = author_id)
       or (blocker_id = author_id and blocked_id = auth.uid())
  )
);
drop policy if exists "post_comments_insert_own" on post_comments;
create policy "post_comments_insert_own" on post_comments for insert with check (
  auth.uid() = author_id
  and not exists (
    select 1 from blocks b
    join posts p on p.id = post_comments.post_id
    where (b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
       or (b.blocker_id = p.author_id and b.blocked_id = auth.uid())
  )
);

-- Activity comments
drop policy if exists "activity_comments_select_all" on activity_comments;
drop policy if exists "activity_comments_select_not_blocked" on activity_comments;
create policy "activity_comments_select_not_blocked" on activity_comments for select using (
  not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = author_id)
       or (blocker_id = author_id and blocked_id = auth.uid())
  )
);
drop policy if exists "activity_comments_insert_own" on activity_comments;
create policy "activity_comments_insert_own" on activity_comments for insert with check (
  auth.uid() = author_id
  and not exists (
    select 1 from blocks b
    join activities a on a.id = activity_comments.activity_id
    where (b.blocker_id = auth.uid() and b.blocked_id = a.organizer_id)
       or (b.blocker_id = a.organizer_id and b.blocked_id = auth.uid())
  )
);

-- Group joining
drop policy if exists "group_members_insert_self_public" on group_members;
create policy "group_members_insert_self_public" on group_members for insert with check (
  auth.uid() = user_id
  and group_id in (select id from groups where is_public = true)
  and not exists (
    select 1 from blocks b
    join groups g on g.id = group_members.group_id
    where (b.blocker_id = auth.uid() and b.blocked_id = g.creator_id)
       or (b.blocker_id = g.creator_id and b.blocked_id = auth.uid())
  )
);
drop policy if exists "group_members_insert_admin" on group_members;
create policy "group_members_insert_admin" on group_members for insert with check (
  is_group_admin(group_id, auth.uid())
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = group_members.user_id)
       or (blocker_id = group_members.user_id and blocked_id = auth.uid())
  )
);

-- Verify — should return with no error:
select * from activities limit 1;
select * from posts limit 1;
