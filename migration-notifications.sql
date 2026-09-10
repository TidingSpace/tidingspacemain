-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- schema.sql was already updated for future fresh installs — this brings
-- your current, already-running database in line with it.

create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  actor_id uuid references profiles(id) on delete cascade,
  type text not null,
  activity_id uuid references activities(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists notifications_recipient_idx on notifications (recipient_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications for select using (auth.uid() = recipient_id);

drop policy if exists "notifications_insert_as_actor" on notifications;
create policy "notifications_insert_as_actor" on notifications for insert with check (auth.uid() = actor_id);

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications for update using (auth.uid() = recipient_id);

-- Verify:
select * from notifications limit 5;
