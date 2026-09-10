// Application-layer grouping only — the database keeps its granular categories
// (see supabase/schema.sql `categories` table). These broad groups exist purely
// for the Explore screen's top-level filter chips, per product decision:
// "the chips are top-level discovery filters, not the actual database categories."
//
// Corrected per explicit product direction: yoga is genuinely a subcategory
// of Wellness (along with the standalone "Wellness" category itself), and
// volunteer is its own distinct category — NOT wellness, despite an earlier
// version of this file placing it there as an admitted "least-bad fit."
// `network` (networking mixers) stays under Learning (professional
// development), the one remaining imperfect-but-reasonable fit.
// groupIconPath: dedicated icons made specifically for these broad groups
// (not borrowed from the base category icons below, which power map pins
// and stay a separate, independent set). Colors are baked into each SVG file.
export const CATEGORY_GROUPS: { key: string; label: string; dbCategories: string[]; groupIconPath: string }[] = [
  { key: 'wellness', label: 'Wellness', dbCategories: ['yoga', 'wellness'], groupIconPath: '/icons/groups/wellness.svg' },
  { key: 'sports', label: 'Sports', dbCategories: ['hike', 'sports', 'running'], groupIconPath: '/icons/groups/sports.svg' },
  { key: 'music', label: 'Music', dbCategories: ['concert', 'dance'], groupIconPath: '/icons/groups/music.svg' },
  { key: 'food', label: 'Food', dbCategories: ['bar', 'food'], groupIconPath: '/icons/groups/food.svg' },
  { key: 'arts', label: 'Arts', dbCategories: ['workshop'], groupIconPath: '/icons/groups/arts.svg' },
  { key: 'learning', label: 'Learning', dbCategories: ['language', 'network'], groupIconPath: '/icons/groups/learning.svg' },
  { key: 'community', label: 'Community', dbCategories: ['volunteer'], groupIconPath: '/icons/groups/community.svg' }
];

// Icons for individual DB categories — used for map pins and anywhere the
// specific (not grouped) category needs a visual. This is the single source
// of truth for the category → icon mapping (also re-exported by
// components/CategoryIcon.tsx for JSX call sites) — kept as a plain lookup
// here, rather than only in a .tsx component, since this file is also
// imported into ActivityMap's imperative Mapbox marker code (raw DOM
// elements, not JSX), which can't import from a .tsx component file's
// React-rendering context the same way.
//
// IMPORTANT: if you add a category via the admin panel (Admin → Categories),
// add its key here too — otherwise it silently falls back to the sports icon
// (see categoryIconPath below) and won't appear in any CATEGORY_GROUPS chip.
export const CATEGORY_ICONS: Record<string, string> = {
  yoga: '/icons/categories/yoga.svg', hike: '/icons/categories/hike.svg', dance: '/icons/categories/dance.svg',
  language: '/icons/categories/language.svg', network: '/icons/categories/network.svg',
  concert: '/icons/categories/concert.svg', workshop: '/icons/categories/workshop.svg',
  volunteer: '/icons/categories/volunteer.svg', bar: '/icons/categories/bar.svg', sports: '/icons/categories/sports.svg',
  food: '/icons/categories/food.svg', running: '/icons/categories/running.svg', wellness: '/icons/categories/wellness.svg'
};

export function categoryIconPath(key: string): string {
  return CATEGORY_ICONS[key] ?? '/icons/categories/sports.svg';
}

export function dbCategoriesForGroup(groupKey: string): string[] {
  const group = CATEGORY_GROUPS.find((g) => g.key === groupKey);
  return group ? group.dbCategories : [];
}
