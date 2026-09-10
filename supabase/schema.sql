-- ============================================================
-- Tiding Space — Database Schema
-- Run this in Supabase: Project → SQL Editor → New Query → paste → Run
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- PROFILES ----------
-- One row per authenticated user, linked to Supabase Auth's auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  handle text unique,
  bio text,
  avatar_color text default '#7A5AF8',
  avatar_url text,  -- real uploaded photo; avatar_color remains the fallback for initials-based avatars when this is null
  is_organizer boolean default false,
  verification_tier text default 'unverified' check (verification_tier in ('unverified','phone_verified','trusted','business')),
  activities_hosted_count int default 0,
  activity_reminders_enabled boolean default true,  -- controls whether the dynamic "starts soon" notification appears
  email_notifications_enabled boolean default true, -- stored now for future use — no emails are actually sent yet
  time_format_24h boolean default false,             -- false = 12-hour "10 AM", true = 24-hour "10:00"
  last_seen_at timestamptz,                          -- heartbeat-updated while the app is open; drives online/offline dots
  is_admin boolean default false,                    -- gates /admin/reports; set manually via SQL, no UI grants this
  account_status text default 'active' check (account_status in ('active','suspended','banned')), -- admin moderation; enforced via RLS on key write paths, not just a cosmetic flag
  is_verified_organizer boolean default false, -- admin-granted; future-ready for a public verified badge, not shown in the public app yet
  created_at timestamptz default now()
);

-- ---------- CATEGORIES ----------
create table categories (
  key text primary key,        -- e.g. 'yoga', 'hike'
  label text not null,
  icon text not null,           -- emoji or icon key
  sort_order integer default 0  -- admin-panel reordering; ties broken by key for a stable default order
);

insert into categories (key, label, icon) values
  ('yoga','Yoga','/icons/categories/yoga.svg'), ('hike','Hiking','/icons/categories/hike.svg'), ('dance','Dance','/icons/categories/dance.svg'),
  ('language','Language','/icons/categories/language.svg'), ('network','Networking','/icons/categories/network.svg'),
  ('concert','Concert','/icons/categories/concert.svg'), ('workshop','Workshop','/icons/categories/workshop.svg'),
  ('volunteer','Volunteer','/icons/categories/volunteer.svg'), ('bar','Bar Meetup','/icons/categories/bar.svg'), ('sports','Sports','/icons/categories/sports.svg'),
  ('food','Food','/icons/categories/food.svg'), ('running','Running','/icons/categories/running.svg'), ('wellness','Wellness','/icons/categories/wellness.svg');

-- ---------- ACTIVITIES ----------
create table activities (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references profiles(id) on delete cascade,
  category text not null references categories(key),
  title text not null,
  description text,
  latitude double precision not null,
  longitude double precision not null,
  address text,                          -- full address, only shown to confirmed attendees
  cover_image_url text,                  -- nullable; no upload flow yet (same gap as posts.image_url) — UI shows a placeholder until Storage is wired
  photo_urls text[] default '{}',        -- multi-photo support for the Activity Details gallery; same no-upload-yet caveat as cover_image_url
  starts_at timestamptz not null,
  ends_at timestamptz,
  price_cents int default 0,             -- 0 = free
  capacity int not null default 20,
  is_recurring boolean default false,
  -- Minimum fields for simple recurrence — deliberately not a full RRULE/ICS
  -- model. Each occurrence is a genuinely separate row in this same table
  -- (see migration-recurring-activities.sql for the full reasoning); these
  -- two columns just let occurrences of the same series be identified and
  -- labeled. recurrence_group_id is a shared tag, not a foreign key to
  -- another activity — there's no single "parent" row, every occurrence is
  -- a peer.
  recurrence_group_id uuid,
  recurrence_rule text check (recurrence_rule in ('daily', 'weekly', 'monthly')),
  status text default 'active' check (status in ('active','cancelled','completed','hidden')), -- 'hidden' is admin moderation (invisible to the public, distinct from the organizer's own 'cancelled')
  featured boolean default false,        -- admin-curated; future-ready for surfacing in Explore, not wired into the public app yet
  featured_until timestamptz,            -- optional expiry; null means "featured indefinitely until manually removed"
  featured_reason text,                  -- internal-only context for why this was featured, not shown publicly
  -- References activity_messages(id), but that table doesn't exist yet at
  -- this point in the file — the FK constraint itself is added further down,
  -- right after activity_messages is created.
  pinned_message_id uuid,
  created_at timestamptz default now()
);

create index activities_recurrence_group_idx on activities (recurrence_group_id) where recurrence_group_id is not null;

create index activities_location_idx on activities (latitude, longitude);
create index activities_starts_at_idx on activities (starts_at);
create index activities_category_idx on activities (category);

-- Trigram GIN indexes — added during a scalability review, specifically
-- for the columns real ILIKE '%...%' searches actually run against
-- (verified by grepping every .ilike()/.or() call across search routes,
-- not guessed). A standard B-tree index can't help a leading-wildcard
-- ILIKE at all; pg_trgm's GIN index can. Not yet a crisis at 10k users —
-- Postgres can sequential-scan a table that size in low tens of
-- milliseconds — but this is cheap to add now and prevents predictable
-- degradation as data grows past that, rather than needing a retrofit
-- once search is already noticeably slow.
create extension if not exists pg_trgm;
create index activities_title_trgm_idx on activities using gin (title gin_trgm_ops);
create index activities_description_trgm_idx on activities using gin (description gin_trgm_ops);
create index profiles_name_trgm_idx on profiles using gin (name gin_trgm_ops);
create index profiles_handle_trgm_idx on profiles using gin (handle gin_trgm_ops);
create index groups_name_trgm_idx on groups using gin (name gin_trgm_ops);
create index posts_text_trgm_idx on posts using gin (text gin_trgm_ops);
-- Composite index for Explore's date-range filtering (status = 'active' AND
-- starts_at BETWEEN ...) — the single-column starts_at index above still
-- exists for other query patterns, but this one matches the exact WHERE
-- clause shape of the map's primary query, letting Postgres satisfy both
-- the equality and range conditions in a single index scan.
create index activities_status_starts_at_idx on activities (status, starts_at);

-- ---------- RSVPS ----------
create table rsvps (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references activities(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text default 'confirmed' check (status in ('confirmed','waitlisted','cancelled','checked_in')),
  created_at timestamptz default now(),
  unique (activity_id, user_id)
);

create index rsvps_activity_idx on rsvps (activity_id);
create index rsvps_user_idx on rsvps (user_id);

-- ---------- FOLLOWS ----------
-- Generalized to follow ANY profile — a regular user or a business/organizer.
-- The underlying relationship was always just "follower -> some profile";
-- this is a naming/product clarification, not a new capability.
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followed_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followed_id),
  constraint no_self_follow check (follower_id <> followed_id)
);

-- ---------- SAVED ACTIVITIES ----------
create table saved_activities (
  user_id uuid not null references profiles(id) on delete cascade,
  activity_id uuid not null references activities(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, activity_id)
);

-- ---------- POSTS ----------
-- Feed posts. Not the core product, but social proof / discovery layer.
-- type='text'|'image'|'repost'. A repost points at another post via repost_of.
create table posts (
  id uuid primary key default uuid_generate_v4(),
  author_id uuid not null references profiles(id) on delete cascade,
  type text not null default 'text' check (type in ('text','image','repost')),
  text text,
  image_url text,
  image_urls text[] default '{}',  -- multi-photo support for Create Post; same no-Storage caveat as image_url — schema-ready, upload not wired yet
  activity_id uuid references activities(id) on delete set null, -- optional tag linking back to an activity
  repost_of uuid references posts(id) on delete cascade,          -- set only when type = 'repost'
  hidden boolean default false,    -- admin moderation; enforced via RLS below, not just an application-level filter
  created_at timestamptz default now()
);

create index posts_author_idx on posts (author_id);
create index posts_created_at_idx on posts (created_at desc);

-- ---------- POST LIKES ----------
create table post_likes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- ---------- POST COMMENTS ----------
create table post_comments (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

create index post_comments_post_idx on post_comments (post_id);

-- ---------- SAVED POSTS ----------
create table saved_posts (
  user_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

-- ---------- DIRECT MESSAGES (1:1) ----------
create table direct_messages (
  id uuid primary key default uuid_generate_v4(),
  sender_id uuid not null references profiles(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  image_url text,  -- optional image attachment; text stays required but can be '' for image-only messages
  read_at timestamptz,
  created_at timestamptz default now(),
  constraint no_self_dm check (sender_id <> recipient_id)
);

-- Fast lookup of a conversation between two specific people, in either direction
create index dm_thread_idx on direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);
create index dm_recipient_idx on direct_messages (recipient_id, created_at);

-- ---------- COMMUNITIES (per-activity group chat) ----------
-- Auto-exists for every activity. Membership = organizer + anyone who RSVP'd.
-- This is the "chat with attendees before and after events" from the original spec —
-- distinct from the 1:1 direct_messages above.
create table activity_messages (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references activities(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  image_url text,
  created_at timestamptz default now()
);

alter table activities add constraint activities_pinned_message_fk
  foreign key (pinned_message_id) references activity_messages(id) on delete set null;

-- One reaction row per (message, user, emoji) — mirrors post_likes' shape,
-- extended with which emoji. A user can react to the same message with
-- several different emoji (each its own row), but not the same emoji twice —
-- the primary key enforces that; toggling is handled in the API route
-- (insert if absent, delete if present), not here.
create table activity_message_reactions (
  message_id uuid not null references activity_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

create index activity_messages_activity_idx on activity_messages (activity_id, created_at);

-- ---------- GROUPS (user-created, joinable) ----------
-- Distinct from activity_messages above: these aren't tied to any one activity —
-- anyone can create one, and public groups can be browsed and joined by anyone.
create table groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  creator_id uuid not null references profiles(id) on delete cascade,
  avatar_color text default '#7A5AF8',
  -- References group_messages(id), added further down as a separate FK
  -- constraint once that table exists.
  pinned_message_id uuid,
  is_public boolean default true,
  hidden boolean default false,    -- admin moderation; enforced via RLS below
  created_at timestamptz default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text default 'member' check (role in ('admin','member')),
  -- Per-member read tracking for group chat unread badges — a group
  -- message has many recipients, unlike a DM's single read_at column, so
  -- "have I read this" has to live on the membership row instead of the
  -- message itself. Null means "never opened this chat" (treat any
  -- message as unread), not "read at the epoch."
  last_read_at timestamptz,
  -- 'pending' = invited by an admin, not yet accepted — must NOT grant chat
  -- access (see the RLS policies below, all of which filter on this).
  -- 'declined' is a genuine, kept row (not a delete) so it's distinguishable
  -- from "never invited at all" — needed so the notification can correctly
  -- keep showing "Declined" after a reload instead of Accept/Decline again.
  -- Self-joining a public group inserts directly as 'active'; only
  -- admin-added invites go through 'pending' first.
  status text not null default 'active' check (status in ('active', 'pending', 'declined')),
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table group_messages (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references groups(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  image_url text,
  created_at timestamptz default now()
);

alter table groups add constraint groups_pinned_message_fk
  foreign key (pinned_message_id) references group_messages(id) on delete set null;

create table group_message_reactions (
  message_id uuid not null references group_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

create index group_messages_group_idx on group_messages (group_id, created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table activities enable row level security;
alter table rsvps enable row level security;
alter table follows enable row level security;
alter table saved_activities enable row level security;
alter table posts enable row level security;
alter table post_likes enable row level security;
alter table post_comments enable row level security;
alter table saved_posts enable row level security;
alter table direct_messages enable row level security;
alter table activity_messages enable row level security;
alter table activity_message_reactions enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_messages enable row level security;
alter table group_message_reactions enable row level security;

-- Profiles: anyone can read, only the owner can update their own
create policy "profiles_select_all" on profiles for select using (true);
create policy "categories_select_all" on categories for select using (true);
create policy "categories_insert_admin" on categories for insert with check (is_admin(auth.uid()));
create policy "categories_update_admin" on categories for update using (is_admin(auth.uid()));
create policy "categories_delete_admin" on categories for delete using (is_admin(auth.uid()));
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

-- Blocks — defined here, early, because several policies below (activities,
-- posts, comments, follows, RSVPs, group joining) reference this table
-- directly in their own USING/WITH CHECK clauses. Postgres validates a
-- policy's referenced tables at CREATE POLICY time, so this table must
-- exist before any of them, not just before it's practically needed.
create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

alter table blocks enable row level security;

create policy "blocks_select_own" on blocks for select using (auth.uid() = blocker_id);
create policy "blocks_insert_own" on blocks for insert with check (auth.uid() = blocker_id);
create policy "blocks_delete_own" on blocks for delete using (auth.uid() = blocker_id);

-- is_admin / is_active_account — defined here, early, for the same reason
-- `blocks` itself was moved early: several policies throughout this file
-- (not just admin-specific ones) need to reference them, and a function
-- must exist before any policy created later in the file can use it.
create or replace function is_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = p_user_id), false);
$$;

-- Real enforcement for suspend/ban, not a cosmetic flag. Originally applied
-- only to activities/posts/comments (Phase 1); a later security review
-- found this left RSVPs, direct messages, group messages, and group
-- creation completely unenforced — a suspended or banned account could
-- still join activities, message people, and post in groups. All five are
-- now covered, so account_status is checked on every meaningful write path
-- a suspended/banned user could otherwise use.
create or replace function is_active_account(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select account_status = 'active' from profiles where id = p_user_id), false);
$$;

-- Activities: anyone can read active ones; only the organizer can create/edit their own
create policy "activities_select_not_blocked" on activities for select using (
  (status != 'hidden' or auth.uid() = organizer_id or is_admin(auth.uid()))
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = organizer_id)
       or (blocker_id = organizer_id and blocked_id = auth.uid())
  )
);
create policy "activities_insert_own" on activities for insert with check (
  auth.uid() = organizer_id and is_active_account(auth.uid())
);
create policy "activities_update_own" on activities for update using (auth.uid() = organizer_id);
create policy "activities_delete_own" on activities for delete using (auth.uid() = organizer_id);
-- Admin-panel moderation (Hide/Cancel/Delete) needs to act on activities
-- the admin doesn't organize themselves — is_admin() is defined early in
-- this file specifically so policies like these can reference it.
create policy "activities_update_admin" on activities for update using (is_admin(auth.uid()));
create policy "activities_delete_admin" on activities for delete using (is_admin(auth.uid()));

-- RSVPs: users can see RSVPs for activities they organize or attend; can only create/cancel their own
create policy "rsvps_select_own_or_organizer" on rsvps for select using (
  auth.uid() = user_id
  or auth.uid() in (select organizer_id from activities where activities.id = rsvps.activity_id)
);
-- Additive: confirmed/checked-in attendance is genuinely public (normal for any
-- event platform — who's going isn't sensitive). Waitlist status stays private
-- to the organizer and the person themselves, via the policy above.
create policy "rsvps_select_public_confirmed" on rsvps for select using (
  status in ('confirmed', 'checked_in')
);
create policy "rsvps_insert_own" on rsvps for insert with check (
  auth.uid() = user_id
  and is_active_account(auth.uid())
  and not exists (
    select 1 from blocks b
    join activities a on a.id = rsvps.activity_id
    where (b.blocker_id = auth.uid() and b.blocked_id = a.organizer_id)
       or (b.blocker_id = a.organizer_id and b.blocked_id = auth.uid())
  )
);
create policy "rsvps_update_own" on rsvps for update using (auth.uid() = user_id);
create policy "rsvps_update_by_organizer" on rsvps for update using (
  auth.uid() in (select organizer_id from activities where activities.id = rsvps.activity_id)
);

-- Follows: anyone can read; only the follower can create/delete their own follow
create policy "follows_select_all" on follows for select using (true);
create policy "follows_insert_own" on follows for insert with check (
  auth.uid() = follower_id
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = followed_id)
       or (blocker_id = followed_id and blocked_id = auth.uid())
  )
);
create policy "follows_delete_own" on follows for delete using (auth.uid() = follower_id);

-- Saved activities: private to the user who saved them
create policy "saved_select_own" on saved_activities for select using (auth.uid() = user_id);
create policy "saved_insert_own" on saved_activities for insert with check (auth.uid() = user_id);
create policy "saved_delete_own" on saved_activities for delete using (auth.uid() = user_id);

-- Posts: anyone can read; only the author can create/delete their own
-- Hides posts between mutually-blocked users everywhere posts are read
-- (Feed, Search, Profile, etc.) — a single RLS change here covers every
-- current and future query, rather than needing each route to remember to
-- filter blocked authors itself. auth.uid() is null for an unauthenticated
-- viewer, in which case the block check naturally never matches anything
-- (blocking only applies between two real accounts), so this doesn't
-- restrict anonymous viewing.
create policy "posts_select_not_blocked" on posts for select using (
  (not hidden or auth.uid() = author_id or is_admin(auth.uid()))
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = author_id)
       or (blocker_id = author_id and blocked_id = auth.uid())
  )
);
create policy "posts_insert_own" on posts for insert with check (auth.uid() = author_id and is_active_account(auth.uid()));
create policy "posts_delete_own" on posts for delete using (auth.uid() = author_id);
-- No general posts_update_own exists (posts aren't editable by their author
-- in this app) — these two are admin-panel-only additions.
create policy "posts_update_admin" on posts for update using (is_admin(auth.uid()));
create policy "posts_delete_admin" on posts for delete using (is_admin(auth.uid()));

-- Post likes: anyone can read (for counts); only the liker can create/delete their own like
create policy "post_likes_select_all" on post_likes for select using (true);
create policy "post_likes_insert_own" on post_likes for insert with check (auth.uid() = user_id);
create policy "post_likes_delete_own" on post_likes for delete using (auth.uid() = user_id);

-- Post comments ("texting"): anyone can read; only the author can create/delete their own
create policy "post_comments_select_not_blocked" on post_comments for select using (
  not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = author_id)
       or (blocker_id = author_id and blocked_id = auth.uid())
  )
);
create policy "post_comments_insert_own" on post_comments for insert with check (
  auth.uid() = author_id
  and is_active_account(auth.uid())
  and not exists (
    select 1 from blocks b
    join posts p on p.id = post_comments.post_id
    where (b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
       or (b.blocker_id = p.author_id and b.blocked_id = auth.uid())
  )
);
create policy "post_comments_delete_own" on post_comments for delete using (auth.uid() = author_id);

-- Saved posts: private to the user who saved them
create policy "saved_posts_select_own" on saved_posts for select using (auth.uid() = user_id);
create policy "saved_posts_insert_own" on saved_posts for insert with check (auth.uid() = user_id);
create policy "saved_posts_delete_own" on saved_posts for delete using (auth.uid() = user_id);

-- Direct messages: only the two participants can read a thread.
-- You can only send as yourself, and only mark messages sent TO you as read.
drop policy if exists "dm_select_participant" on direct_messages;
create policy "dm_select_participant" on direct_messages for select using (
  auth.uid() = sender_id
  or (
    auth.uid() = recipient_id
    and not exists (
      select 1 from blocks
      where (blocker_id = sender_id and blocked_id = recipient_id)
         or (blocker_id = recipient_id and blocked_id = sender_id)
    )
  )
);

drop policy if exists "dm_insert_own" on direct_messages;
create policy "dm_insert_own" on direct_messages for insert with check (
  auth.uid() = sender_id
);
create policy "dm_update_mark_read" on direct_messages for update using (
  auth.uid() = recipient_id
);
-- Admin-panel moderation: reviewing/removing a reported message. Direct
-- messages are otherwise strictly private (sender/recipient only) — this
-- is the one deliberate, admin-only exception.
create policy "dm_select_admin" on direct_messages for select using (is_admin(auth.uid()));
create policy "dm_delete_admin" on direct_messages for delete using (is_admin(auth.uid()));

-- Turn on Realtime so both sides of a conversation get new messages
-- pushed instantly, without polling.
alter publication supabase_realtime add table direct_messages;

-- Activity chat: only the organizer or someone who has RSVP'd (any non-cancelled status)
-- can read or post. Strangers who never joined can't see or join the conversation.
create policy "activity_messages_select" on activity_messages for select using (
  auth.uid() in (select organizer_id from activities where activities.id = activity_messages.activity_id)
  or auth.uid() in (
    select user_id from rsvps
    where rsvps.activity_id = activity_messages.activity_id
    and rsvps.status in ('confirmed','waitlisted','checked_in')
  )
);
create policy "activity_messages_insert" on activity_messages for insert with check (
  auth.uid() = author_id and (
    auth.uid() in (select organizer_id from activities where activities.id = activity_messages.activity_id)
    or auth.uid() in (
      select user_id from rsvps
      where rsvps.activity_id = activity_messages.activity_id
      and rsvps.status in ('confirmed','waitlisted','checked_in')
    )
  )
);

-- Reactions: same membership rule as the messages themselves — organizer or
-- a confirmed/waitlisted/checked-in attendee. Deliberately re-checks
-- membership via the message's activity_id rather than assuming "you could
-- see the message, so you can react to it," since reactions have their own
-- insert policy regardless of how the row was found.
create policy "activity_message_reactions_select" on activity_message_reactions for select using (
  auth.uid() in (
    select organizer_id from activities where activities.id = (
      select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id
    )
  )
  or auth.uid() in (
    select user_id from rsvps
    where rsvps.activity_id = (select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id)
    and rsvps.status in ('confirmed','waitlisted','checked_in')
  )
);
create policy "activity_message_reactions_insert" on activity_message_reactions for insert with check (
  auth.uid() = user_id and (
    auth.uid() in (
      select organizer_id from activities where activities.id = (
        select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id
      )
    )
    or auth.uid() in (
      select user_id from rsvps
      where rsvps.activity_id = (select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id)
      and rsvps.status in ('confirmed','waitlisted','checked_in')
    )
  )
);
create policy "activity_message_reactions_delete_own" on activity_message_reactions for delete using (auth.uid() = user_id);

-- Turn on Realtime for this table so the chat UI gets live updates
-- without polling — new rows push to subscribed clients instantly.
alter publication supabase_realtime add table activity_messages;

-- Groups: anyone can see public groups; members can see private ones they're in.
-- Anyone logged in can create a group (they become its first admin member via the app logic).
-- Helper functions for group_members RLS — needed because a policy on
-- group_members that queries group_members itself (even via an alias)
-- causes "infinite recursion detected in policy" in Postgres: evaluating
-- the policy requires running the subquery, which is itself subject to the
-- same policy, which requires running the subquery again, forever. The same
-- problem also occurs *across* tables — groups' own policies querying
-- group_members, whose policies query groups right back — so these
-- functions are used on both tables' policies, not just group_members'.
-- SECURITY DEFINER functions run as their owner (which owns this table),
-- and table owners bypass RLS on their own tables by default — so the
-- membership check inside the function never re-triggers the policy that's
-- calling it. This is the standard, documented pattern for self-referential
-- membership/permission tables in Postgres RLS. Defined here, before both
-- tables' policies, since SQL requires a function to exist before it's
-- referenced.
create or replace function is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'active'
  );
$$;

create or replace function is_group_admin(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id and role = 'admin' and status = 'active'
  );
$$;

create or replace function has_group_row(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

create policy "groups_select" on groups for select using (
  (not hidden or is_group_member(id, auth.uid()) or auth.uid() = creator_id or is_admin(auth.uid()))
  and (
    is_public = true
    or is_group_member(id, auth.uid())
    or has_group_row(id, auth.uid()) -- includes pending invites, so the invite notification can show which group it's for
  )
);
create policy "groups_insert_own" on groups for insert with check (auth.uid() = creator_id and is_active_account(auth.uid()));
create policy "groups_delete_creator" on groups for delete using (auth.uid() = creator_id);
create policy "groups_update_admin" on groups for update using (
  is_group_admin(id, auth.uid())
);
-- Deliberately, distinctly named (not "groups_update_admin") — that name is
-- already taken by the GROUP-level admin concept (a member with role =
-- 'admin' in that one group) above. This is the platform admin panel's own
-- override, a completely different kind of "admin."
create policy "groups_update_platform_admin" on groups for update using (is_admin(auth.uid()));
create policy "groups_delete_platform_admin" on groups for delete using (is_admin(auth.uid()));

-- Group membership: members can see who else is in a group they're also in,
-- or in any public group. You can add yourself to a public group (join),
-- or an admin can add someone else (invite) to any group.
create policy "group_members_select" on group_members for select using (
  auth.uid() = user_id -- always see your own row, including a pending invite — needed so you can see and respond to it
  or is_group_member(group_id, auth.uid())
  or group_id in (select id from groups where is_public = true)
);
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
create policy "group_members_insert_admin" on group_members for insert with check (
  is_group_admin(group_id, auth.uid())
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = group_members.user_id)
       or (blocker_id = group_members.user_id and blocked_id = auth.uid())
  )
);
-- Accepting an invite is an UPDATE (pending -> active) on your own row. RLS
-- only restricts WHICH ROW (must be yours) — it's the API route's job to
-- only ever send { status: 'active' } as the update payload, not exposing
-- arbitrary column changes to the client, consistent with how this app
-- handles row-vs-field authorization elsewhere.
create policy "group_members_update_own" on group_members for update using (auth.uid() = user_id);
-- An admin can update OTHER members' rows too (role promote/demote). RLS
-- only restricts WHICH ROW (must be in a group this user administers) —
-- consistent with how group_members_update_own works for accepting your own
-- invite, it's the API route's job to only ever send a safe, specific
-- field (role), not expose arbitrary column changes to the client.
create policy "group_members_update_admin" on group_members for update using (
  is_group_admin(group_id, auth.uid())
);
create policy "group_members_delete_own" on group_members for delete using (auth.uid() = user_id);
-- An admin can remove OTHER members too, not just leave themselves.
create policy "group_members_delete_admin" on group_members for delete using (
  is_group_admin(group_id, auth.uid())
);

-- Group messages: only ACTIVE members can read or post — is_group_member()
-- already filters out pending invites, so using it here (instead of the
-- previous raw, status-blind subquery) is what actually keeps a pending
-- invitee out of the chat until they accept.
create policy "group_messages_select" on group_messages for select using (
  is_group_member(group_id, auth.uid())
);
-- Admin-panel moderation: same reasoning as direct_messages above.
create policy "group_messages_select_admin" on group_messages for select using (is_admin(auth.uid()));
create policy "group_messages_delete_admin" on group_messages for delete using (is_admin(auth.uid()));
create policy "group_messages_insert" on group_messages for insert with check (
  auth.uid() = author_id
  and is_active_account(auth.uid())
  and is_group_member(group_id, auth.uid())
);

-- Reactions: reuses is_group_member() (defined earlier for group_members'
-- own policies) rather than a raw subquery — not strictly required to avoid
-- recursion here (this table isn't part of that self-referential chain),
-- but consistent with how membership is checked everywhere else now.
create policy "group_message_reactions_select" on group_message_reactions for select using (
  is_group_member(
    (select group_id from group_messages where group_messages.id = group_message_reactions.message_id),
    auth.uid()
  )
);
create policy "group_message_reactions_insert" on group_message_reactions for insert with check (
  auth.uid() = user_id
  and is_group_member(
    (select group_id from group_messages where group_messages.id = group_message_reactions.message_id),
    auth.uid()
  )
);
create policy "group_message_reactions_delete_own" on group_message_reactions for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table group_messages;
alter publication supabase_realtime add table group_message_reactions;
alter publication supabase_realtime add table activity_message_reactions;

-- ============================================================
-- PROFILE INTERESTS
-- ============================================================
-- User-selected, not auto-computed. Reuses the real `categories` table via
-- foreign key — no separate/duplicate taxonomy for "interests".
create table profile_interests (
  profile_id uuid not null references profiles(id) on delete cascade,
  category_key text not null references categories(key) on delete cascade,
  created_at timestamptz default now(),
  primary key (profile_id, category_key)
);

alter table profile_interests enable row level security;

create policy "profile_interests_select_all" on profile_interests for select using (true);
create policy "profile_interests_insert_own" on profile_interests for insert with check (auth.uid() = profile_id);
create policy "profile_interests_delete_own" on profile_interests for delete using (auth.uid() = profile_id);

-- ============================================================
-- ACTIVITY COMMENTS (public Q&A on the listing itself)
-- ============================================================
-- Distinct from activity_messages (the private, attendee-only group chat).
-- This is a public comment thread anyone can read and post to, same spirit
-- as a comment section on an event listing.
create table activity_comments (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references activities(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

create index activity_comments_activity_idx on activity_comments (activity_id, created_at);

alter table activity_comments enable row level security;

create policy "activity_comments_select_not_blocked" on activity_comments for select using (
  not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = author_id)
       or (blocker_id = author_id and blocked_id = auth.uid())
  )
);
create policy "activity_comments_insert_own" on activity_comments for insert with check (
  auth.uid() = author_id
  and is_active_account(auth.uid())
  and not exists (
    select 1 from blocks b
    join activities a on a.id = activity_comments.activity_id
    where (b.blocker_id = auth.uid() and b.blocked_id = a.organizer_id)
       or (b.blocker_id = a.organizer_id and b.blocked_id = auth.uid())
  )
);
create policy "activity_comments_delete_own" on activity_comments for delete using (auth.uid() = author_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
-- Deliberately generic: `type` is plain text with NO check constraint, so new
-- notification types can be added later purely at the application layer,
-- without a schema migration. activity_id/post_id are both included for
-- future extensibility even though today's scoped types only use activity_id.
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete cascade,
  type text not null,
  activity_id uuid references activities(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index notifications_recipient_idx on notifications (recipient_id, created_at desc);

-- ============================================================
-- PUSH SUBSCRIPTIONS — one row per device/browser a user has enabled web
-- push on (the same person could enable it on their phone AND a desktop
-- browser, both should receive a push). endpoint is the actual identity
-- of a subscription (unique per device+browser install), not user_id —
-- that's why it's the primary key and why re-subscribing on the same
-- device safely upserts rather than creating a duplicate row.
-- ============================================================
create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
create policy "push_subscriptions_select_own" on push_subscriptions for select using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on push_subscriptions for delete using (auth.uid() = user_id);
-- No update policy needed — a changed subscription (new keys) is always
-- an upsert on the same endpoint via insert ... on conflict, not a
-- separate update path.

-- ============================================================
-- ACTIVITY INVITES — tracks accept/decline state per invite, which a plain
-- notification row can't represent on its own. One row per (activity,
-- invitee) pair — re-inviting the same person just leaves their existing
-- pending invite alone rather than creating a duplicate.
-- ============================================================
create table activity_invites (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references activities(id) on delete cascade,
  inviter_id uuid not null references profiles(id) on delete cascade,
  invitee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  responded_at timestamptz,
  unique (activity_id, invitee_id)
);
create index activity_invites_invitee_idx on activity_invites (invitee_id);
create index activity_invites_activity_idx on activity_invites (activity_id);

alter table activity_invites enable row level security;
-- Either side of the invite can see it — the inviter to know who they've
-- already invited, the invitee to see and respond to their own invites.
create policy "activity_invites_select_participant" on activity_invites for select using (
  auth.uid() = inviter_id or auth.uid() = invitee_id
);
create policy "activity_invites_insert_as_inviter" on activity_invites for insert with check (auth.uid() = inviter_id);
-- Only the invitee can respond (accept/decline) — the inviter can't set
-- their own invite's status, which would defeat the point of asking.
create policy "activity_invites_update_as_invitee" on activity_invites for update using (auth.uid() = invitee_id);

-- ============================================================
-- ADMIN BROADCASTS — platform-wide notifications sent by admins. A single
-- broadcast fans out into many individual `notifications` rows (one per
-- matching recipient) when sent, linked back via broadcast_id so a
-- recipient's notification feed can show the same title/message admins see
-- here, rather than duplicating that text onto every fanned-out row.
-- ============================================================
create table admin_broadcasts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  message text not null,
  notification_type text not null check (notification_type in ('information','announcement','warning','maintenance')),
  audience_type text not null check (audience_type in ('everyone','city','category','organizers','user')),
  -- Meaning depends on audience_type: a category key, a target user id, or
  -- (for 'city') a free-text city name that currently has NO real backend
  -- resolution — see the route's own comment for why.
  audience_value text,
  -- 'sending' is a short-lived claim state, not a normal user-facing
  -- status: the scheduled-broadcast cron atomically flips a row from
  -- 'scheduled' to 'sending' (an UPDATE ... WHERE status = 'scheduled',
  -- checking the affected row count) before doing any actual send work.
  -- If two cron runs ever overlap, only one UPDATE can succeed — the other
  -- finds the row no longer 'scheduled' and safely skips it. This is what
  -- prevents the same broadcast from being sent twice.
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer default 0,
  failure_reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index admin_broadcasts_created_idx on admin_broadcasts (created_at desc);

alter table admin_broadcasts enable row level security;
create policy "admin_broadcasts_select_admin" on admin_broadcasts for select using (is_admin(auth.uid()));
create policy "admin_broadcasts_insert_admin" on admin_broadcasts for insert with check (is_admin(auth.uid()));
create policy "admin_broadcasts_update_admin" on admin_broadcasts for update using (is_admin(auth.uid()));

alter table notifications add column broadcast_id uuid references admin_broadcasts(id) on delete cascade;
-- Admin-authored fan-out notifications don't have a natural "actor" the way
-- "so-and-so liked your post" does — inserted by the server (service-role-
-- equivalent path via requireAdmin(), not the acting admin's own uid) since
-- notifications_insert_as_actor would otherwise require auth.uid() to equal
-- actor_id for every one of potentially thousands of fanned-out rows.
create policy "notifications_insert_admin_broadcast" on notifications for insert with check (
  broadcast_id is not null and is_admin(auth.uid())
);

alter table notifications enable row level security;

create policy "notifications_select_own" on notifications for select using (auth.uid() = recipient_id);
-- Insert is keyed to the ACTOR, not the recipient — e.g. when you join an activity,
-- you (the actor) create a notification FOR the organizer (the recipient). This is
-- safe because it's never exposed as a raw public endpoint — notifications are only
-- ever created as a side effect inside existing, already-authorized action routes.
create policy "notifications_insert_as_actor" on notifications for insert with check (auth.uid() = actor_id);
create policy "notifications_update_own" on notifications for update using (auth.uid() = recipient_id);

-- ============================================================
-- SAFETY: REPORTS + BLOCKS
-- ============================================================
create table reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_user_id uuid references profiles(id) on delete cascade,
  reported_activity_id uuid references activities(id) on delete cascade,
  reported_post_id uuid references posts(id) on delete cascade,
  reported_group_id uuid references groups(id) on delete cascade,
  reported_direct_message_id uuid references direct_messages(id) on delete cascade,
  reported_group_message_id uuid references group_messages(id) on delete cascade,
  reason text not null,
  details text,
  status text default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz default now()
);

alter table reports enable row level security;

-- Reports: anyone can file one; you can only see your own submission history.
-- NOTE: there's no admin role built here — reviewing reports for moderation
-- action requires a separate admin dashboard using the service_role key
-- (bypasses RLS), not something end users' anon-key sessions should ever see.
create policy "reports_insert_own" on reports for insert with check (auth.uid() = reporter_id);
create policy "reports_select_own" on reports for select using (auth.uid() = reporter_id);

-- Admin review access — SECURITY DEFINER so checking is_admin doesn't need
-- its own separate RLS grant on profiles just to read one boolean column,
-- same pattern as is_group_admin()/is_group_member() elsewhere in this file.
-- is_admin() and is_active_account() are defined early in this file
-- (right after the blocks table) since policies throughout — not just
-- these ones — need to reference them, and a function must exist before
-- any policy created earlier in the file can use it.

create policy "reports_select_admin" on reports for select using (is_admin(auth.uid()));
create policy "reports_update_admin" on reports for update using (is_admin(auth.uid()));

-- ============================================================
-- ADMIN AUDIT LOG — every admin panel mutation gets a row here. Written by
-- the shared logAdminAction() helper (lib/adminAudit.ts), called from
-- every admin route that changes something, not left to each route to
-- remember to log itself ad hoc.
-- ============================================================
create table admin_audit_log (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references profiles(id) on delete set null,
  action text not null,           -- short, human-meaningful verb phrase, e.g. "suspended user", "cancelled activity"
  target_type text not null,      -- 'user' | 'activity' | 'post' | 'group' | 'report' | 'category'
  target_id text,                 -- stored as text, not a strict FK — the target may later be deleted, and the log must survive that
  details text,                   -- optional extra context, e.g. the reason given
  created_at timestamptz default now()
);
create index admin_audit_log_created_idx on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;
create policy "admin_audit_log_select_admin" on admin_audit_log for select using (is_admin(auth.uid()));
create policy "admin_audit_log_insert_admin" on admin_audit_log for insert with check (is_admin(auth.uid()));

-- ============================================================
-- ADMIN NOTES — internal-only context on a user/activity/group/organizer,
-- never exposed anywhere in the public application. Deliberately generic
-- (target_type + target_id, not a separate table per entity type) since
-- the shape of a note is identical regardless of what it's attached to.
-- ============================================================
create table admin_notes (
  id uuid primary key default uuid_generate_v4(),
  target_type text not null check (target_type in ('user','activity','group','organizer')),
  target_id uuid not null,
  admin_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index admin_notes_target_idx on admin_notes (target_type, target_id, created_at desc);

alter table admin_notes enable row level security;
create policy "admin_notes_select_admin" on admin_notes for select using (is_admin(auth.uid()));
create policy "admin_notes_insert_admin" on admin_notes for insert with check (is_admin(auth.uid()));
create policy "admin_notes_update_admin" on admin_notes for update using (is_admin(auth.uid()));
create policy "admin_notes_delete_admin" on admin_notes for delete using (is_admin(auth.uid()));

-- ============================================================
-- PLATFORM SETTINGS — a reusable key-value configuration store, not
-- hardcoded values scattered through the app. Each row is one named
-- setting; value is stored as text and parsed by whatever reads it
-- (booleans as 'true'/'false', numbers as their string form) — simple and
-- sufficient for the small number of settings this needs, without the
-- overhead of a typed schema-per-setting.
-- ============================================================
create table platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id) on delete set null
);

alter table platform_settings enable row level security;
-- Some settings (e.g. maintenance_mode) may eventually need to be read by
-- the public app itself to actually behave differently — select is left
-- open to any authenticated user for that future-readiness, while writes
-- stay admin-only. Nothing in the public app reads this yet.
create policy "platform_settings_select_authenticated" on platform_settings for select using (auth.uid() is not null);
create policy "platform_settings_upsert_admin" on platform_settings for insert with check (is_admin(auth.uid()));
create policy "platform_settings_update_admin" on platform_settings for update using (is_admin(auth.uid()));

insert into platform_settings (key, value) values
  ('maintenance_mode', 'false'),
  ('user_registration_enabled', 'true'),
  ('email_verification_required', 'false'),
  ('default_activity_duration_hours', '2'),
  ('default_map_zoom', '12'),
  ('beta_mode', 'true')
on conflict (key) do nothing;

-- Blocks: fully private to the blocker. A block is one-directional in the data
-- model (matches "I don't want to see/hear from them"); the DM policy below
-- checks both directions so it works whether either side blocked the other.
-- Enforce blocks at the DM layer: you can't send a message to someone who
-- blocked you, or to someone you've blocked.
drop policy if exists "dm_insert_own" on direct_messages;
create policy "dm_insert_own" on direct_messages for insert with check (
  auth.uid() = sender_id
  and is_active_account(auth.uid())
);

-- Enforce blocks in group chat too — previously only DMs, activity comments,
-- posts, and RSVPs checked `blocks`, leaving group messages as the one
-- interaction type a blocked pair could still be forced to see each other
-- in (if both remain members of a shared group). Mirrors the DM approach:
-- filtered on the read side only (you simply don't see their messages),
-- not blocked on insert — a group has other members who haven't blocked
-- anyone, and their view of the chat shouldn't be affected by someone
-- else's block. group_messages_select_admin (separate policy, OR'd in)
-- still lets admins see everything for moderation regardless of blocks.
drop policy if exists "group_messages_select" on group_messages;
create policy "group_messages_select" on group_messages for select using (
  is_group_member(group_id, auth.uid())
  and not exists (
    select 1 from blocks
    where (blocker_id = author_id and blocked_id = auth.uid())
       or (blocker_id = auth.uid() and blocked_id = author_id)
  )
);

-- ============================================================
-- AUTO-CREATE A PROFILE ROW WHEN A NEW USER SIGNS UP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    lower(split_part(new.email, '@', 1)) || '_' || substr(new.id::text, 1, 4)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- HELPER VIEW: activities with live spots-remaining count
-- ============================================================
create view activities_with_availability as
select
  a.*,
  a.capacity - coalesce((
    select count(*) from rsvps r
    where r.activity_id = a.id and r.status = 'confirmed'
  ), 0) as spots_remaining
from activities a;


-- ============================================================
-- RATE LIMITING — minimal, backed by the existing database rather than a
-- new external service. Tracks recent actions per user; checked before
-- content-creation writes on the highest-abuse-risk routes (posts, comments,
-- reports). Grows over time with no cleanup job yet — see note in
-- lib/rateLimit.ts; acceptable at closed-beta scale, worth revisiting later.
-- ============================================================
create table rate_limit_log (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz default now()
);

create index rate_limit_log_lookup_idx on rate_limit_log (user_id, action, created_at);

alter table rate_limit_log enable row level security;

-- A user can only see/add their own rate-limit history — this only ever
-- gates the same user's own next action, so there's no cross-user impact
-- possible even though the check is (necessarily) run with the user's own
-- session rather than an elevated one.
create policy "rate_limit_select_own" on rate_limit_log for select using (auth.uid() = user_id);
create policy "rate_limit_insert_own" on rate_limit_log for insert with check (auth.uid() = user_id);

-- ============================================================
-- STORAGE — real image upload for avatars, activity covers, post photos
-- ============================================================
-- Three separate buckets rather than one shared bucket, for clarity of intent
-- even though all three end up using the same uploader-scoped ownership rule
-- at the Storage level (see note on activity-covers below for why — images
-- are uploaded before their parent row exists, so Storage can only verify
-- "you uploaded this," not "you organize this activity" or "you wrote this
-- post." The real per-entity ownership check (organizer_id, author_id) is
-- enforced separately, at the database level, by each table's existing RLS.
--
-- Path convention for all three: {owner_id}/{filename} — the policies below
-- read the owner out of the path via storage.foldername(name), which splits
-- the object path into an array of folder segments.

-- 10MB is generous headroom for a single uncompressed phone photo (the app
-- compresses client-side before upload, so real uploads are far smaller than
-- this in practice) while still rejecting genuinely oversized files. The MIME
-- allowlist is enforced by Supabase at the bucket level — this is real,
-- server-side validation that can't be bypassed by a request crafted outside
-- the app's own client code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('activity-covers', 'activity-covers', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('post-images', 'post-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('chat-images', 'chat-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Public read on all three — images need to be viewable by anyone in the app,
-- not just the owner (matches every bucket's public:true flag above; explicit
-- policies here are defense-in-depth, not strictly required, but make the
-- intent readable rather than implicit).
create policy "avatars_read_all" on storage.objects for select using (bucket_id = 'avatars');
create policy "activity_covers_read_all" on storage.objects for select using (bucket_id = 'activity-covers');
create policy "post_images_read_all" on storage.objects for select using (bucket_id = 'post-images');
create policy "chat_images_read_all" on storage.objects for select using (bucket_id = 'chat-images');

-- Avatars: path is {user_id}/{filename} — only that user may write there.
create policy "avatars_write_own" on storage.objects for insert with check (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "avatars_update_own" on storage.objects for update using (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "avatars_delete_own" on storage.objects for delete using (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Activity covers: path is {user_id}/{filename} — NOT {activity_id}/{filename}.
-- This matters: images are uploaded from the Create Activity form BEFORE the
-- activity row exists, so there's no activity_id yet to scope by. Ownership
-- here is "whoever uploaded it," same as post-images — the actual "is this
-- YOUR activity" check happens separately, at the database level, via the
-- existing activities_insert_own/activities_update_own RLS when the activity
-- row referencing this URL is created or edited.
create policy "activity_covers_write_own" on storage.objects for insert with check (
  bucket_id = 'activity-covers' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "activity_covers_update_own" on storage.objects for update using (
  bucket_id = 'activity-covers' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "activity_covers_delete_own" on storage.objects for delete using (
  bucket_id = 'activity-covers' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Post images: path is {user_id}/{filename}. Images are uploaded during
-- compose, before the post row exists (there's no post_id yet to scope by),
-- so ownership here is "whoever uploaded it" via their own user_id folder —
-- the actual post.author_id check happens separately, at the database level,
-- when the post row referencing these URLs is created (existing posts RLS).
create policy "post_images_write_own" on storage.objects for insert with check (
  bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "post_images_update_own" on storage.objects for update using (
  bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "post_images_delete_own" on storage.objects for delete using (
  bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Chat images: same uploader-scoped pattern as the other three. A message's
-- sender/author is already enforced at the database level by each message
-- table's existing RLS (sender_id/author_id = auth.uid() on insert).
create policy "chat_images_write_own" on storage.objects for insert with check (
  bucket_id = 'chat-images' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "chat_images_update_own" on storage.objects for update using (
  bucket_id = 'chat-images' and auth.uid()::text = (storage.foldername(name))[1]
);
create policy "chat_images_delete_own" on storage.objects for delete using (
  bucket_id = 'chat-images' and auth.uid()::text = (storage.foldername(name))[1]
);
