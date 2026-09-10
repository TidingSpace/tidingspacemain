-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds per-member read tracking for group chats, so group conversations get
-- real unread badges in Inbox — the same way DM conversations already do.
-- No RLS changes needed: the existing group_members_update_own policy
-- (auth.uid() = user_id) already covers updating your own last_read_at.

alter table group_members add column if not exists last_read_at timestamptz;

-- Verify:
select column_name, data_type from information_schema.columns
where table_name = 'group_members' and column_name = 'last_read_at';
