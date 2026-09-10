-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds the full Admin Panel foundation: is_admin/account_status on
-- profiles, hidden flags on activities/posts/groups (all with real RLS
-- enforcement, not cosmetic), categories.sort_order, reports.reported_group_id,
-- and the admin_audit_log table. Every admin route relies on requireAdmin()
-- server-side (lib/adminAuth.ts) — never just hidden links.

-- ---------- profiles ----------
alter table profiles add column if not exists is_admin boolean default false;
alter table profiles add column if not exists account_status text default 'active';
alter table profiles drop constraint if exists profiles_account_status_check;
alter table profiles add constraint profiles_account_status_check check (account_status in ('active','suspended','banned'));

-- ---------- activities: 'hidden' status ----------
alter table activities drop constraint if exists activities_status_check;
alter table activities add constraint activities_status_check check (status in ('active','cancelled','completed','hidden'));

-- ---------- posts: hidden flag (no status/update policy existed before) ----------
alter table posts add column if not exists hidden boolean default false;

-- ---------- groups: hidden flag ----------
alter table groups add column if not exists hidden boolean default false;

-- ---------- categories: reordering ----------
alter table categories add column if not exists sort_order integer default 0;

-- ---------- reports: group reports ----------
alter table reports add column if not exists reported_group_id uuid references groups(id) on delete cascade;

-- ---------- helper functions ----------
create or replace function is_admin(p_user_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select coalesce((select is_admin from profiles where id = p_user_id), false); $$;

create or replace function is_active_account(p_user_id uuid)
returns boolean language sql security definer stable set search_path = public
as $$ select coalesce((select account_status = 'active' from profiles where id = p_user_id), false); $$;

-- ---------- activities RLS ----------
drop policy if exists "activities_select_not_blocked" on activities;
create policy "activities_select_not_blocked" on activities for select using (
  (status != 'hidden' or auth.uid() = organizer_id or is_admin(auth.uid()))
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = organizer_id)
       or (blocker_id = organizer_id and blocked_id = auth.uid())
  )
);
drop policy if exists "activities_insert_own" on activities;
create policy "activities_insert_own" on activities for insert with check (
  auth.uid() = organizer_id and is_active_account(auth.uid())
);
drop policy if exists "activities_update_admin" on activities;
create policy "activities_update_admin" on activities for update using (is_admin(auth.uid()));
drop policy if exists "activities_delete_admin" on activities;
create policy "activities_delete_admin" on activities for delete using (is_admin(auth.uid()));

-- ---------- posts RLS ----------
drop policy if exists "posts_select_not_blocked" on posts;
create policy "posts_select_not_blocked" on posts for select using (
  (not hidden or auth.uid() = author_id or is_admin(auth.uid()))
  and not exists (
    select 1 from blocks
    where (blocker_id = auth.uid() and blocked_id = author_id)
       or (blocker_id = author_id and blocked_id = auth.uid())
  )
);
drop policy if exists "posts_insert_own" on posts;
create policy "posts_insert_own" on posts for insert with check (auth.uid() = author_id and is_active_account(auth.uid()));
drop policy if exists "posts_update_admin" on posts;
create policy "posts_update_admin" on posts for update using (is_admin(auth.uid()));
drop policy if exists "posts_delete_admin" on posts;
create policy "posts_delete_admin" on posts for delete using (is_admin(auth.uid()));

-- ---------- post_comments RLS ----------
drop policy if exists "post_comments_insert_own" on post_comments;
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

-- ---------- groups RLS ----------
drop policy if exists "groups_select" on groups;
create policy "groups_select" on groups for select using (
  (not hidden or is_group_member(id, auth.uid()) or auth.uid() = creator_id or is_admin(auth.uid()))
  and (
    is_public = true
    or is_group_member(id, auth.uid())
    or has_group_row(id, auth.uid())
  )
);
drop policy if exists "groups_update_platform_admin" on groups;
create policy "groups_update_platform_admin" on groups for update using (is_admin(auth.uid()));
drop policy if exists "groups_delete_platform_admin" on groups;
create policy "groups_delete_platform_admin" on groups for delete using (is_admin(auth.uid()));

-- ---------- categories RLS ----------
drop policy if exists "categories_insert_admin" on categories;
create policy "categories_insert_admin" on categories for insert with check (is_admin(auth.uid()));
drop policy if exists "categories_update_admin" on categories;
create policy "categories_update_admin" on categories for update using (is_admin(auth.uid()));
drop policy if exists "categories_delete_admin" on categories;
create policy "categories_delete_admin" on categories for delete using (is_admin(auth.uid()));

-- ---------- reports RLS (may already exist from the earlier reports-review migration) ----------
drop policy if exists "reports_select_admin" on reports;
create policy "reports_select_admin" on reports for select using (is_admin(auth.uid()));
drop policy if exists "reports_update_admin" on reports;
create policy "reports_update_admin" on reports for update using (is_admin(auth.uid()));

-- ---------- admin audit log ----------
create table if not exists admin_audit_log (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid references profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  details text,
  created_at timestamptz default now()
);
create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);
alter table admin_audit_log enable row level security;
drop policy if exists "admin_audit_log_select_admin" on admin_audit_log;
create policy "admin_audit_log_select_admin" on admin_audit_log for select using (is_admin(auth.uid()));
drop policy if exists "admin_audit_log_insert_admin" on admin_audit_log;
create policy "admin_audit_log_insert_admin" on admin_audit_log for insert with check (is_admin(auth.uid()));

-- IMPORTANT — run this yourself, with your own real user id, to actually
-- grant yourself admin access. Nothing else here does this for you.
-- Find your id: select id, name from profiles where handle = 'your-handle';
-- update profiles set is_admin = true where id = 'YOUR-USER-ID-HERE';

-- Verify:
select column_name from information_schema.columns where table_name = 'profiles' and column_name in ('is_admin','account_status');
