-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Adds DM notifications — previously a known, explicit gap (the
-- "Messages" notification filter was permanently empty).

alter table notifications add column if not exists direct_message_id uuid references direct_messages(id) on delete cascade;

-- Verify:
select column_name from information_schema.columns where table_name = 'notifications' and column_name = 'direct_message_id';
