-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds the minimum fields needed for simple recurring activities.
-- Architecture: NOT a full RRULE/ICS model. Each occurrence of a recurring
-- activity is generated as its own genuine row in the activities table at
-- creation time (bounded to a fixed horizon, see the API route), sharing a
-- recurrence_group_id tag. This means every existing part of the app that
-- already reads from `activities` / `activities_with_availability` — Explore,
-- Search, Feed, Profile, organizer pages, RSVPs, joins, chat — needs zero
-- changes to correctly show, join, and manage each occurrence individually.

alter table activities add column if not exists recurrence_group_id uuid;
alter table activities add column if not exists recurrence_rule text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activities_recurrence_rule_check'
  ) then
    alter table activities add constraint activities_recurrence_rule_check
      check (recurrence_rule in ('daily', 'weekly', 'monthly'));
  end if;
end $$;

create index if not exists activities_recurrence_group_idx
  on activities (recurrence_group_id) where recurrence_group_id is not null;

-- IMPORTANT: activities_with_availability is a view built with "select a.*".
-- Postgres fixes a view's column list at CREATE VIEW time — it does NOT
-- automatically pick up columns added to the underlying table afterward via
-- ALTER TABLE. Every API route reads through this view, not the raw table,
-- so without recreating it here, recurrence_group_id and recurrence_rule
-- would be silently absent from every response despite genuinely existing
-- on the table. (This is the identical issue previously found and fixed
-- with cover_image_url/photo_urls — applied proactively this time.)
drop view if exists activities_with_availability;
create view activities_with_availability as
select
  a.*,
  a.capacity - coalesce((
    select count(*) from rsvps r
    where r.activity_id = a.id and r.status = 'confirmed'
  ), 0) as spots_remaining
from activities a;

-- Verify:
select column_name, data_type from information_schema.columns
where table_name = 'activities' and column_name in ('recurrence_group_id', 'recurrence_rule', 'is_recurring');

select column_name from information_schema.columns
where table_name = 'activities_with_availability' and column_name in ('recurrence_group_id', 'recurrence_rule');
