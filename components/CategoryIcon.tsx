// The category → icon mapping itself lives in lib/categoryGroups.ts (single
// source of truth — that file is also imported by ActivityMap's imperative
// Mapbox marker code, which can't import from a .tsx component). Re-exported
// here so existing JSX call sites can keep importing from this component.
import { CATEGORY_ICONS as CATEGORY_ICON_PATHS, categoryIconPath } from '@/lib/categoryGroups';
export { CATEGORY_ICON_PATHS, categoryIconPath };

// Renders a category's icon image at a consistent size. Accepts either a
// category key (looked up against the map above) or a direct src (e.g. when
// the icon path already came from the database via /api/categories).
export default function CategoryIcon({
  categoryKey,
  src,
  size = 20,
  alt = ''
}: {
  categoryKey?: string;
  src?: string;
  size?: number;
  alt?: string;
}) {
  const resolvedSrc = src || (categoryKey ? categoryIconPath(categoryKey) : CATEGORY_ICON_PATHS.sports);
  return <img src={resolvedSrc} alt={alt} width={size} height={size} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />;
}
