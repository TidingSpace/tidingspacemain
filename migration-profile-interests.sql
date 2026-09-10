-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- schema.sql was already updated for future fresh installs — this brings
-- your current, already-running database in line with it.

create table if not exists profile_interests (
  profile_id uuid not null references profiles(id) on delete cascade,
  category_key text not null references categories(key) on delete cascade,
  created_at timestamptz default now(),
  primary key (profile_id, category_key)
);

alter table profile_interests enable row level security;

create policy "profile_interests_select_all" on profile_interests for select using (true);
create policy "profile_interests_insert_own" on profile_interests for insert with check (auth.uid() = profile_id);
create policy "profile_interests_delete_own" on profile_interests for delete using (auth.uid() = profile_id);

-- Verify:
select * from profile_interests limit 5;
