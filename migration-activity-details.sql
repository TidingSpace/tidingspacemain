-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- schema.sql was already updated for future fresh installs — this brings
-- your current, already-running database in line with it.

-- 1. Fix: confirmed/checked-in attendance should be publicly visible (who's
--    going to a public activity isn't sensitive info). Without this, the
--    Feed's attendee avatar stack has been silently rendering empty for
--    anyone who isn't the organizer.
drop policy if exists "rsvps_select_public_confirmed" on rsvps;
create policy "rsvps_select_public_confirmed" on rsvps for select using (
  status in ('confirmed', 'checked_in')
);

-- 2. Multi-photo support for Activity Details.
alter table activities add column if not exists photo_urls text[] default '{}';

-- 3. Public Q&A comments on activity listings (distinct from the private
--    attendee-only group chat, which already exists as activity_messages).
create table if not exists activity_comments (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references activities(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

create index if not exists activity_comments_activity_idx on activity_comments (activity_id, created_at);

alter table activity_comments enable row level security;

drop policy if exists "activity_comments_select_all" on activity_comments;
create policy "activity_comments_select_all" on activity_comments for select using (true);

drop policy if exists "activity_comments_insert_own" on activity_comments;
create policy "activity_comments_insert_own" on activity_comments for insert with check (auth.uid() = author_id);

drop policy if exists "activity_comments_delete_own" on activity_comments;
create policy "activity_comments_delete_own" on activity_comments for delete using (auth.uid() = author_id);

-- Verify:
select photo_urls from activities limit 1;
select * from activity_comments limit 1;
