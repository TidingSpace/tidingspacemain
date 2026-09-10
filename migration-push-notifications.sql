-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds push_subscriptions — one row per device/browser a user has enabled
-- web push on. Required for the new push notification feature (DMs, group
-- chat, and activity chat messages) to work at all.

create table if not exists push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
drop policy if exists "push_subscriptions_select_own" on push_subscriptions;
create policy "push_subscriptions_select_own" on push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "push_subscriptions_insert_own" on push_subscriptions;
create policy "push_subscriptions_insert_own" on push_subscriptions for insert with check (auth.uid() = user_id);
drop policy if exists "push_subscriptions_delete_own" on push_subscriptions;
create policy "push_subscriptions_delete_own" on push_subscriptions for delete using (auth.uid() = user_id);

-- Verify:
select column_name from information_schema.columns where table_name = 'push_subscriptions';
