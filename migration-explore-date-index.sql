-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Adds a composite index supporting Explore's new date-range filtering.
--
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction block, and
-- Supabase's SQL Editor wraps queries in one — so this uses a plain
-- CREATE INDEX instead. That briefly locks the table for writes while it
-- builds, which is a real consideration on a large, already-live production
-- table, but is effectively instant at this app's current (pre-beta) size.
-- If this is ever run later against a much larger table, do it via a direct
-- psql connection instead, outside of any transaction, so CONCURRENTLY can
-- be used.

create index if not exists activities_status_starts_at_idx
  on activities (status, starts_at);

-- Verify:
select indexname from pg_indexes where tablename = 'activities' and indexname = 'activities_status_starts_at_idx';
