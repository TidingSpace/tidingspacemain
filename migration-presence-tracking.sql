-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds real online/offline presence tracking, replacing the two decorative
-- (always-green) dots in Inbox's DM list and the Conversation header. No
-- RLS changes needed — the existing profiles_update_own policy
-- (auth.uid() = id) already covers the heartbeat's own update.

alter table profiles add column if not exists last_seen_at timestamptz;

-- Verify:
select column_name, data_type from information_schema.columns
where table_name = 'profiles' and column_name = 'last_seen_at';
