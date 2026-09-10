-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds trigram (pg_trgm) GIN indexes for the exact columns ILIKE search
-- actually runs against — verified by grepping every .ilike()/.or() call
-- across the app's search routes, not guessed. A standard B-tree index
-- can't help a leading-wildcard ILIKE at all; this can. Not urgent at
-- exactly 10k users, but cheap to add now versus retrofitting once search
-- is already noticeably slow.

create extension if not exists pg_trgm;

create index if not exists activities_title_trgm_idx on activities using gin (title gin_trgm_ops);
create index if not exists activities_description_trgm_idx on activities using gin (description gin_trgm_ops);
create index if not exists profiles_name_trgm_idx on profiles using gin (name gin_trgm_ops);
create index if not exists profiles_handle_trgm_idx on profiles using gin (handle gin_trgm_ops);
create index if not exists groups_name_trgm_idx on groups using gin (name gin_trgm_ops);
create index if not exists posts_text_trgm_idx on posts using gin (text gin_trgm_ops);

-- Verify:
select indexname from pg_indexes where indexname like '%_trgm_idx';
