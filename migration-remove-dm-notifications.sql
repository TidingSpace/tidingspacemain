-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Reverts DM notifications — new messages now surface only in Messages
-- itself (unread counts/badges), not in the Notifications center. This
-- removes the now-dead direct_message_id column and any existing
-- new_message notification rows that would otherwise just silently not
-- render (harmless, but no reason to leave them sitting there unread forever).

delete from notifications where type = 'new_message';

alter table notifications drop column if exists direct_message_id;

-- Verify:
select column_name from information_schema.columns where table_name = 'notifications' and column_name = 'direct_message_id';
select count(*) from notifications where type = 'new_message';
