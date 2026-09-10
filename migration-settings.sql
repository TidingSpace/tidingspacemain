-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- schema.sql was already updated for future fresh installs — this brings
-- your current, already-running database in line with it.

alter table profiles add column if not exists activity_reminders_enabled boolean default true;
alter table profiles add column if not exists email_notifications_enabled boolean default true;

-- Verify:
select id, name, activity_reminders_enabled, email_notifications_enabled from profiles limit 5;
