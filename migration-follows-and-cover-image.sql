-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- (schema.sql itself was already updated for future fresh installs — this
-- migration brings your current, already-running database in line with it.)

-- 1. Generalize follows: rename organizer_id -> followed_id.
--    No data loss — this is a pure rename, existing follow rows are preserved.
alter table follows rename column organizer_id to followed_id;
alter table follows add constraint no_self_follow check (follower_id <> followed_id);

-- 2. Add cover_image_url to activities, for the rich activity card in Feed.
--    Nullable, defaults to null on existing rows — no upload flow yet, so this
--    just makes the column available for when Supabase Storage is wired up.
alter table activities add column if not exists cover_image_url text;

-- Verify:
select follower_id, followed_id from follows limit 5;
select id, title, cover_image_url from activities limit 5;
