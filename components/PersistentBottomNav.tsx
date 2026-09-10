'use client';

import { usePathname } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { useBottomNavVisibility } from '@/lib/bottomNavVisibility';

// The routes that ever show the bottom nav at all — everything else
// (chat screens, activity detail, admin, login, etc.) never shows it,
// regardless of the context override below. /profile/[userId] is included
// here since it's the right route family, but its actual visibility for
// a given profile is further narrowed by the context (shown for your own
// profile, hidden for someone else's — the same route pattern can't tell
// those apart on the path alone).
const NAV_ROUTES = ['/', '/feed', '/inbox', '/search', '/notifications', '/profile'];

// Rendered once, in the root layout — this is what actually stops the tab
// bar itself from unmounting and remounting (with its own unread-count
// refetch) every single time you switch tabs, which it previously did
// since each page rendered its own separate <BottomNav />.
export default function PersistentBottomNav() {
  const pathname = usePathname();
  const { hidden } = useBottomNavVisibility();

  const onNavRoute = NAV_ROUTES.some((route) => (route === '/' ? pathname === '/' : pathname.startsWith(route)));
  if (!onNavRoute || hidden) return null;

  return <BottomNav />;
}
