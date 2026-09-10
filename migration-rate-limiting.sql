-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Adds minimal rate-limit tracking, addressing a High finding from the
-- security audit (no rate limiting existed anywhere in the app).

create table if not exists rate_limit_log (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz default now()
);

create index if not exists rate_limit_log_lookup_idx on rate_limit_log (user_id, action, created_at);

alter table rate_limit_log enable row level security;

drop policy if exists "rate_limit_select_own" on rate_limit_log;
create policy "rate_limit_select_own" on rate_limit_log for select using (auth.uid() = user_id);

drop policy if exists "rate_limit_insert_own" on rate_limit_log;
create policy "rate_limit_insert_own" on rate_limit_log for insert with check (auth.uid() = user_id);

-- Verify:
select column_name from information_schema.columns where table_name = 'rate_limit_log';
