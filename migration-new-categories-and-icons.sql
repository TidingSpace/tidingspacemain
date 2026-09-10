-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds 3 new activity categories (Food, Running, Wellness) and updates the
-- icon path for every category, since all 13 category icons were replaced
-- with a new set. No RLS changes needed — categories_select_all is already
-- public-read and unaffected by new rows or updated icon paths.

insert into categories (key, label, icon) values
  ('food', 'Food', '/icons/categories/food.svg'),
  ('running', 'Running', '/icons/categories/running.svg'),
  ('wellness', 'Wellness', '/icons/categories/wellness.svg')
on conflict (key) do nothing;

-- Refresh icon paths for existing categories too, in case any activity's
-- category row was cached with an old icon reference (the path strings
-- themselves are unchanged — only the actual SVG files behind them were
-- replaced — but this update is harmless and idempotent either way).
update categories set icon = '/icons/categories/yoga.svg' where key = 'yoga';
update categories set icon = '/icons/categories/hike.svg' where key = 'hike';
update categories set icon = '/icons/categories/dance.svg' where key = 'dance';
update categories set icon = '/icons/categories/language.svg' where key = 'language';
update categories set icon = '/icons/categories/network.svg' where key = 'network';
update categories set icon = '/icons/categories/concert.svg' where key = 'concert';
update categories set icon = '/icons/categories/workshop.svg' where key = 'workshop';
update categories set icon = '/icons/categories/volunteer.svg' where key = 'volunteer';
update categories set icon = '/icons/categories/bar.svg' where key = 'bar';
update categories set icon = '/icons/categories/sports.svg' where key = 'sports';

-- Verify:
select key, label, icon from categories order by key;
