-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Fixes: "infinite recursion detected in policy for relation groups"
--
-- Root cause: the last migration added a clause to groups_select to let a
-- pending invitee see the group they were invited to — but it used a RAW
-- subquery on group_members instead of a SECURITY DEFINER function. That
-- subquery's own RLS policy (group_members_select) queries groups right
-- back (its public-group fallback clause), recreating the exact mutual
-- A-to-B-to-A recursion this project fixed once already, just from the
-- other direction this time.

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

drop policy if exists "groups_select" on groups;
create policy "groups_select" on groups for select using (
  is_public = true
  or is_group_member(id, auth.uid())
  or has_group_row(id, auth.uid())
);

-- Verify — should return with no error:
select * from groups limit 1;
