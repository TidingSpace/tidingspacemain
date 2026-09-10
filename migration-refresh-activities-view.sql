-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Root cause: activities_with_availability was created (a long time ago, in
-- your database's history) BEFORE cover_image_url and photo_urls existed on
-- the activities table. In Postgres, "select a.*" inside a view is expanded
-- into a fixed column list AT THE MOMENT the view is created — it does NOT
-- automatically pick up columns added to the table later via ALTER TABLE.
-- Both migration-follows-and-cover-image.sql (cover_image_url) and
-- migration-activity-details.sql (photo_urls) added their columns correctly,
-- but neither recreated this view — so it's been silently omitting both
-- fields ever since, even though the underlying table has always had them.
--
-- This is why activity photos never appeared: every response from both
-- /api/activities and /api/activities/[id] reads through this view, so
-- cover_image_url and photo_urls were simply never present in the JSON sent
-- to the browser, regardless of frontend code correctness.

drop view if exists activities_with_availability;

create view activities_with_availability as
select
  a.*,
  a.capacity - coalesce((
    select count(*) from rsvps r
    where r.activity_id = a.id and r.status = 'confirmed'
  ), 0) as spots_remaining
from activities a;

-- Verify — this should now show real values (or null, if that specific
-- activity genuinely has no cover photo) instead of the column being
-- entirely absent from the row:
select id, title, cover_image_url, photo_urls from activities_with_availability limit 5;
