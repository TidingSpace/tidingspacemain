-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Swaps the categories table's emoji icons for real SVG icon paths served
-- from /public/icons/categories/ in the app.

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
select key, label, icon from categories order by label;
