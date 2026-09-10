-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Adds: admin member removal, admin promote/demote, and group deletion by
-- the creator. None of these existed at the RLS level before — only
-- self-leave was possible.

drop policy if exists "group_members_update_admin" on group_members;
create policy "group_members_update_admin" on group_members for update using (
  is_group_admin(group_id, auth.uid())
);

drop policy if exists "group_members_delete_admin" on group_members;
create policy "group_members_delete_admin" on group_members for delete using (
  is_group_admin(group_id, auth.uid())
);

drop policy if exists "groups_delete_creator" on groups;
create policy "groups_delete_creator" on groups for delete using (auth.uid() = creator_id);

-- Verify:
select policyname from pg_policies where tablename in ('groups', 'group_members') order by tablename, policyname;
