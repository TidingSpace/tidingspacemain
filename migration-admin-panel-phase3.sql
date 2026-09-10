-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds message-reporting support (both DM and group messages) with proper
-- admin-only RLS overrides for reviewing/removing them, since messages are
-- otherwise strictly private. Everything else in Phase 3 builds on tables
-- and policies already created by earlier migrations.

alter table reports add column if not exists reported_direct_message_id uuid references direct_messages(id) on delete cascade;
alter table reports add column if not exists reported_group_message_id uuid references group_messages(id) on delete cascade;

drop policy if exists "dm_select_admin" on direct_messages;
create policy "dm_select_admin" on direct_messages for select using (is_admin(auth.uid()));
drop policy if exists "dm_delete_admin" on direct_messages;
create policy "dm_delete_admin" on direct_messages for delete using (is_admin(auth.uid()));

drop policy if exists "group_messages_select_admin" on group_messages;
create policy "group_messages_select_admin" on group_messages for select using (is_admin(auth.uid()));
drop policy if exists "group_messages_delete_admin" on group_messages;
create policy "group_messages_delete_admin" on group_messages for delete using (is_admin(auth.uid()));

-- Verify:
select column_name from information_schema.columns where table_name = 'reports' and column_name like 'reported_%message%';
