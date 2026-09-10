-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds an is_admin flag and a real review path for reports — previously,
-- nobody (including you) could see reports beyond the reporter's own
-- select-own access. This adds admin-only select/update access via RLS,
-- gated by a SECURITY DEFINER helper (same pattern as is_group_admin
-- elsewhere), plus the two routes and page that use it.

alter table profiles add column if not exists is_admin boolean default false;

create or replace function is_admin(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = p_user_id), false);
$$;

drop policy if exists "reports_select_admin" on reports;
create policy "reports_select_admin" on reports for select using (is_admin(auth.uid()));

drop policy if exists "reports_update_admin" on reports;
create policy "reports_update_admin" on reports for update using (is_admin(auth.uid()));

-- IMPORTANT — run this yourself, with your own real user id, to actually
-- grant yourself access. Nothing else in this migration does this for you;
-- there's deliberately no UI that can grant admin access to anyone.
-- Find your id: select id, name from profiles where handle = 'your-handle';
-- update profiles set is_admin = true where id = 'YOUR-USER-ID-HERE';

-- Verify:
select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'is_admin';
