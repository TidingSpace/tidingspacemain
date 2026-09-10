'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import CategoryIcon from '@/components/CategoryIcon';
import ErrorState from '@/components/ErrorState';
import UnderlineTab from '@/components/UnderlineTab';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import Avatar from '@/components/Avatar';
import { COLORS, RADIUS } from '@/lib/designTokens';
import { getActivityTimeState } from '@/lib/activityTimeState';
import { useTimeStateTick } from '@/lib/activityTimeStateHooks';
import ActivityTimeBadge from '@/components/ActivityTimeBadge';

export default function SavedPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<'activities' | 'posts'>('activities');
  const [savedActivities, setSavedActivities] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // One shared clock for this whole list — not one timer per row.
  const tickNow = useTimeStateTick();

  const loadSaved = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch('/api/saved/activities').then((r) => r.json()),
      fetch('/api/saved/posts').then((r) => r.json())
    ]).then(([a, p]) => {
      setSavedActivities(a.saved || []);
      setSavedPosts(p.saved || []);
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/login';
    });
    loadSaved();
  }, [supabase, loadSaved]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      <PageHeader title="Saved" backHref="/" large={false} />

      <div style={{ display: 'flex', gap: 24, padding: '0 20px 16px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
        <UnderlineTab label="Activities" active={tab === 'activities'} onClick={() => setTab('activities')} />
        <UnderlineTab label="Posts" active={tab === 'posts'} onClick={() => setTab('posts')} />
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message="Couldn't load your saved items." onRetry={loadSaved} />}

      {!loading && !error && tab === 'activities' && savedActivities.length === 0 && (
        <EmptyState message="No saved activities yet. Tap the bookmark icon on any activity to save it here." />
      )}
      {!error && tab === 'activities' && savedActivities.map((s) => (
        <Link key={s.activity.id} href="/" style={rowStyle}>
          <div style={{ width: 42, height: 42, borderRadius: RADIUS.md, background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CategoryIcon categoryKey={s.activity.category} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{s.activity.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: COLORS.textFaint }}>{s.activity.profiles?.name} · {new Date(s.activity.starts_at).toLocaleDateString()}</span>
              <ActivityTimeBadge
                state={getActivityTimeState(s.activity.starts_at, s.activity.ends_at ?? null, tickNow)}
                startsAt={s.activity.starts_at}
                now={tickNow}
              />
            </div>
          </div>
        </Link>
      ))}

      {!loading && !error && tab === 'posts' && savedPosts.length === 0 && (
        <EmptyState message="No saved posts yet. Tap the bookmark icon on any post in Feed to save it here." />
      )}
      {!error && tab === 'posts' && savedPosts.map((s) => (
        <Link key={s.post.id} href="/feed" style={rowStyle}>
          <Avatar name={s.post.author?.name || '?'} color={s.post.author?.avatar_color} avatarUrl={s.post.author?.avatar_url} size="md" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{s.post.author?.name}</div>
            <div style={{ fontSize: 12, color: COLORS.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.post.text}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}


const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
  borderBottom: `1px solid ${COLORS.border}`, textDecoration: 'none', color: 'inherit'
};
