-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- schema.sql was already updated for future fresh installs — this brings
-- your current, already-running database in line with it.

alter table posts add column if not exists image_urls text[] default '{}';

-- Verify:
select id, image_url, image_urls from posts limit 5;
