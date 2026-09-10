'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { COLORS, RADIUS } from '@/lib/designTokens';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', exact: true, icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg> },
  { href: '/admin/map', label: 'Live Map', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg> },
  { href: '/admin/organizers', label: 'Organizers', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 15 8 22 9 17 14 18 21 12 17.5 6 21 7 14 2 9 9 8z" /></svg> },
  { href: '/admin/users', label: 'Users', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
  { href: '/admin/activities', label: 'Activities', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
  { href: '/admin/reports', label: 'Reports', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> },
  { href: '/admin/notifications', label: 'Notifications', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg> },
  { href: '/admin/trust-safety', label: 'Trust & Safety', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
  { href: '/admin/analytics', label: 'Analytics', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg> },
  { href: '/admin/categories', label: 'Categories', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg> },
  { href: '/admin/system', label: 'System', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 6v6l4 2" /></svg> },
  { href: '/admin/audit-log', label: 'Audit Log', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="15" y2="17" /></svg> },
  { href: '/admin/settings', label: 'Settings', icon: (c: string) => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg> }
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [pendingReports, setPendingReports] = useState(0);

  useEffect(() => {
    function load() {
      fetch('/api/admin/reports/pending-count').then((r) => r.json()).then((json) => setPendingReports(json.count ?? 0)).catch(() => {});
    }
    load();
    // Polling, not a realtime subscription — this is an internal tool used
    // by a handful of admins, not a chat surface where instant matters;
    // checking every 30s (same cadence as the app's own presence
    // heartbeat) is a real, working "you'll see it soon" signal without
    // holding open a websocket connection on every admin page for
    // something that doesn't need one.
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      width: 224, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
      borderRight: `1px solid ${COLORS.border}`, background: '#fff',
      display: 'flex', flexDirection: 'column', padding: '20px 12px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', marginBottom: 28 }}>
        <img src="/icon-192.png" alt="" width={26} height={26} style={{ borderRadius: 8 }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>Tiding Space</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: COLORS.textFaint, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '2px 6px' }}>ADMIN</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
          const showBadge = item.href === '/admin/reports' && pendingReports > 0;
          return (
            <a
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: RADIUS.sm,
                textDecoration: 'none', fontSize: 13.5, fontWeight: active ? 700 : 600,
                color: active ? COLORS.violet : COLORS.textSecondary,
                background: active ? COLORS.violetTint : 'transparent'
              }}
            >
              {item.icon(active ? COLORS.violet : COLORS.textFaint)}
              <span style={{ flex: 1 }}>{item.label}</span>
              {showBadge && (
                <span style={{
                  minWidth: 18, height: 18, borderRadius: 9, background: COLORS.danger, color: '#fff',
                  fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px'
                }}>
                  {pendingReports > 99 ? '99+' : pendingReports}
                </span>
              )}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
