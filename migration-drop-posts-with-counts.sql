-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Removes the posts_with_counts view. It was never actually queried by any
-- route — both post routes deliberately query the posts table directly
-- instead, since PostgREST's relationship embedding (the author/activity
-- joins) is unreliable through views. The view was harmless sitting
-- unused, but kept around it risks a future change "helpfully" switching to
-- it and reintroducing that exact problem.

drop view if exists posts_with_counts;

-- Verify — should return no rows:
select * from information_schema.views where table_name = 'posts_with_counts';
