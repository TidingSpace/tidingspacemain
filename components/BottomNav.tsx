'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import CreateActionSheet from './CreateActionSheet';
import { COLORS } from '@/lib/designTokens';

const INACTIVE = COLORS.textMuted;
const ACTIVE = COLORS.violet;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((json) => {
        const count = (json.conversations || []).filter((c: any) => c.unread).length;
        setUnreadCount(count);
      })
      .catch(() => {});
  }, []);

  // BottomNav is mounted once at the root (see PersistentBottomNav) and
  // navigates via router.push() rather than <Link>, so none of these routes
  // were ever prefetched — every tab switch cold-loaded that page's JS
  // bundle from scratch (Explore's alone is ~160kB beyond the shared chunk,
  // largely mapbox-gl). Prefetching them all once, up front, while the nav
  // is idle is what actually fixes that: router.push() later reuses the
  // already-fetched bundle instead of fetching it at click time.
  useEffect(() => {
    ['/', '/feed', '/inbox', '/profile'].forEach((route) => router.prefetch(route));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Secondary screens reached FROM a tab (not tabs themselves) should still
  // highlight that tab, rather than leaving the whole nav looking inactive —
  // e.g. Search is reached from Explore's search bar, so Explore should stay
  // highlighted while you're there, not go dark as if you'd left the app's
  // main navigation entirely.
  const isExplore = pathname === '/' || pathname.startsWith('/search') || pathname.startsWith('/activities/');
  const isMessagesArea = pathname.startsWith('/inbox') || pathname.startsWith('/messages') || pathname.startsWith('/groups') || pathname.startsWith('/communities');
  const isProfileArea = pathname.startsWith('/profile') || pathname.startsWith('/settings') || pathname.startsWith('/saved');

  return (
    <>
      <nav style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
        background: '#fff', borderTop: `1px solid ${COLORS.border}`,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around',
        padding: '10px 8px calc(10px + env(safe-area-inset-bottom, 0px)) 8px',
        maxWidth: 480, margin: '0 auto'
      }}>
        <NavItem
          label="Explore"
          active={isExplore}
          onClick={() => router.push('/')}
          icon={(c: string) => (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          )}
        />
        <NavItem
          label="Feed"
          active={pathname.startsWith('/feed')}
          onClick={() => router.push('/feed')}
          icon={(c: string) => (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="3" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          )}
        />

        <div style={{ position: 'relative', top: -18 }}>
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Create"
            style={{
              width: 52, height: 52, borderRadius: '50%', border: 'none',
              background: `linear-gradient(135deg, ${COLORS.violet}, ${COLORS.violetLight})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(122,90,248,0.4)', cursor: 'pointer'
            }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <NavItem
          label="Messages"
          active={isMessagesArea}
          onClick={() => router.push('/inbox')}
          badge={unreadCount}
          icon={(c: string) => (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          )}
        />
        <NavItem
          label="Profile"
          active={isProfileArea}
          onClick={() => router.push('/profile')}
          icon={(c: string) => (
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        />
      </nav>

      {sheetOpen && <CreateActionSheet onClose={() => setSheetOpen(false)} />}
    </>
  );
}

function NavItem({ label, active, onClick, icon, badge }: {
  label: string; active: boolean; onClick: () => void;
  icon: (color: string) => React.ReactNode; badge?: number;
}) {
  const color = active ? ACTIVE : INACTIVE;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
        width: 56, padding: '2px 0'
      }}
    >
      <div style={{ position: 'relative' }}>
        {icon(color)}
        {!!badge && badge > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -8, background: COLORS.danger, color: '#fff',
            fontSize: 10, fontWeight: 700, borderRadius: 8, minWidth: 15, height: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px'
          }}>
            {badge}
          </span>
        )}
      </div>
      <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, color }}>{label}</span>
    </button>
  );
}
