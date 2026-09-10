'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { COLORS } from '@/lib/designTokens';
import ErrorState from '@/components/ErrorState';
import Avatar from '@/components/Avatar';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';

type BlockedUser = { id: string; name: string; avatar_color: string; avatar_url?: string | null; handle: string };

export default function BlockedAccountsPage() {
  const supabase = createClient();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return; }
    });
    load();
  }, [supabase]);

  function load() {
    setLoading(true);
    setError(false);
    fetch('/api/blocks')
      .then((r) => r.json())
      .then((json) => {
        if (json.blocked) setBlocked(json.blocked);
        else setError(true);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }

  async function unblock(userId: string) {
    if (!confirm('Unblock this account? They will be able to message you again.')) return;
    await fetch(`/api/blocks/${userId}`, { method: 'DELETE' });
    load();
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh' }}>
      <PageHeader title="Blocked Accounts" backHref="/settings" large={false} />

      {loading && <LoadingState />}
      {error && <ErrorState message="Couldn't load your blocked accounts." onRetry={load} />}
      {!loading && !error && blocked.length === 0 && (
        <EmptyState message="You haven't blocked anyone." />
      )}

      {!error && blocked.map((u) => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
          <Avatar name={u.name} color={u.avatar_color} avatarUrl={u.avatar_url} size="md" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.ink }}>{u.name}</div>
            <div style={{ fontSize: 12.5, color: COLORS.textFaint }}>@{u.handle}</div>
          </div>
          <button
            onClick={() => unblock(u.id)}
            style={{ padding: '7px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.ink, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}
