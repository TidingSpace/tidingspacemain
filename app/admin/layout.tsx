'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminGlobalSearch from '@/components/admin/AdminGlobalSearch';
import LoadingState from '@/components/LoadingState';
import { COLORS } from '@/lib/designTokens';

// This client-side check is a UX convenience only — it decides whether to
// show the sidebar/shell at all, so a non-admin doesn't see a flash of
// layout before being told no. It is NOT the real security boundary: every
// individual admin API route calls requireAdmin() itself (lib/adminAuth.ts)
// and RLS enforces is_admin() at the database level underneath that. Even
// if this check were removed entirely, no admin data could actually be
// fetched by a non-admin — this only controls whether the empty shell renders.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');

  useEffect(() => {
    fetch('/api/admin/me')
      .then((r) => (r.ok ? setStatus('allowed') : setStatus('denied')))
      .catch(() => setStatus('denied'));
  }, []);

  if (status === 'checking') return <LoadingState />;

  if (status === 'denied') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.ink }}>Admin access required</div>
        <p style={{ fontSize: 14, color: COLORS.textSecondary }}>You don't have permission to view this page.</p>
        <a href="/" style={{ color: COLORS.violet, fontWeight: 600, fontSize: 14, marginTop: 8 }}>Return to Tiding Space</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#FAF9FD', fontSize: 14 }}>
      <AdminSidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 28px', borderBottom: `1px solid ${COLORS.border}`, background: '#fff', flexShrink: 0 }}>
          <AdminGlobalSearch />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
