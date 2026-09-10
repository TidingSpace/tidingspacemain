-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Requires migration-fix-group-rls-recursion.sql and
-- migration-pins-reactions-group-invite.sql to have been run already.
--
-- Changes "add person to group" from instant membership to a request/accept
-- flow: an admin's invite creates a 'pending' row, which grants NO chat
-- access until the invited person accepts (turning it 'active') or declines
-- (deleting it).

alter table group_members add column if not exists status text not null default 'active';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'group_members_status_check') then
    alter table group_members add constraint group_members_status_check check (status in ('active', 'pending'));
  end if;
end $$;

alter table notifications add column if not exists group_id uuid references groups(id) on delete cascade;

-- Re-create both membership-check functions to require active status —
-- this is the change that actually prevents a pending invite from granting
-- chat access anywhere these functions are used.
create or replace function is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id and status = 'active'
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
    where group_id = p_group_id and user_id = p_user_id and role = 'admin' and status = 'active'
  );
$$;

drop policy if exists "groups_select" on groups;
create policy "groups_select" on groups for select using (
  is_public = true
  or is_group_member(id, auth.uid())
  or id in (select group_id from group_members where user_id = auth.uid())
);

drop policy if exists "group_members_select" on group_members;
create policy "group_members_select" on group_members for select using (
  auth.uid() = user_id
  or is_group_member(group_id, auth.uid())
  or group_id in (select id from groups where is_public = true)
);

drop policy if exists "group_members_update_own" on group_members;
create policy "group_members_update_own" on group_members for update using (auth.uid() = user_id);

drop policy if exists "group_messages_select" on group_messages;
create policy "group_messages_select" on group_messages for select using (
  is_group_member(group_id, auth.uid())
);

drop policy if exists "group_messages_insert" on group_messages;
create policy "group_messages_insert" on group_messages for insert with check (
  auth.uid() = author_id
  and is_group_member(group_id, auth.uid())
);

-- Verify:
select column_name from information_schema.columns where table_name = 'group_members' and column_name = 'status';
select column_name from information_schema.columns where table_name = 'notifications' and column_name = 'group_id';
