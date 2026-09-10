-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds the 12-hour/24-hour time format preference. No RLS changes needed —
-- this is just a new column on profiles, covered by the existing
-- profiles_update_own policy already in place.

alter table profiles add column if not exists time_format_24h boolean default false;

-- Verify:
select column_name, data_type, column_default from information_schema.columns
where table_name = 'profiles' and column_name = 'time_format_24h';
