-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Fixes: "infinite recursion detected in policy for relation group_members"
--
-- Root cause: two policies on group_members queried group_members itself
-- (even via an alias like "gm2") to check membership/admin status. In
-- Postgres, evaluating that subquery is itself subject to the same RLS
-- policy, which requires running the subquery again, forever. The same
-- problem existed in the other direction too — groups' own policies queried
-- group_members directly, whose policy queried groups right back, creating
-- mutual cross-table recursion even after fixing group_members alone.
--
-- Fix: two SECURITY DEFINER helper functions. These run with the
-- privileges of their owner (who owns the table), and table owners bypass
-- RLS on their own tables by default — so the membership check inside the
-- function never re-triggers the policy that's calling it.

create or replace function is_group_member(p_group_id uuid, p_user_id uuid)
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

create or replace function is_group_admin(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id and role = 'admin'
  );
$$;

-- Rebuild the four affected policies to use the functions instead of raw
-- self-referential subqueries. The other two group_members policies
-- (insert_self_public, delete_own) were never part of the problem and are
-- left untouched.

drop policy if exists "groups_select" on groups;
create policy "groups_select" on groups for select using (
  is_public = true
  or is_group_member(id, auth.uid())
);

drop policy if exists "groups_update_admin" on groups;
create policy "groups_update_admin" on groups for update using (
  is_group_admin(id, auth.uid())
);

drop policy if exists "group_members_select" on group_members;
create policy "group_members_select" on group_members for select using (
  is_group_member(group_id, auth.uid())
  or group_id in (select id from groups where is_public = true)
);

drop policy if exists "group_members_insert_admin" on group_members;
create policy "group_members_insert_admin" on group_members for insert with check (
  is_group_admin(group_id, auth.uid())
);

-- Verify — should return with no error (an empty result is fine, this just
-- confirms the query itself no longer recurses):
select * from group_members limit 1;
select * from groups limit 1;
