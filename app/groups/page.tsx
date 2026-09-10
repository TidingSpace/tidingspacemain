'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import ErrorState from '@/components/ErrorState';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import Avatar from '@/components/Avatar';
import { COLORS, RADIUS } from '@/lib/designTokens';

type Group = {
  id: string;
  name: string;
  description: string | null;
  avatar_color: string;
  is_public: boolean;
  member_count: number;
  isMember: boolean;
};

export default function GroupsPage() {
  const supabase = createClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const loadGroups = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch('/api/groups')
      .then((r) => r.json())
      .then((json) => {
        if (json.groups) setGroups(json.groups);
        else setError(true);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/login';
    });
    loadGroups();
  }, [supabase, loadGroups]);

  async function handleJoin(g: Group) {
    setJoiningId(g.id);
    await fetch(`/api/groups/${g.id}/join`, { method: 'POST' });
    window.location.href = `/groups/${g.id}`;
  }

  const myGroups = groups.filter((g) => g.isMember);
  const discoverGroups = groups.filter((g) => !g.isMember && g.is_public);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 40 }}>
      <PageHeader
        title="Groups"
        backHref="/inbox"
        large={false}
        right={<Link href="/groups/new" style={{ padding: '7px 14px', borderRadius: RADIUS.sm, background: COLORS.violet, color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>+ New</Link>}
      />

      {loading && <LoadingState />}
      {error && <ErrorState message="Couldn't load groups." onRetry={loadGroups} />}

      {!loading && !error && myGroups.length > 0 && (
        <>
          <div style={sectionLabelStyle}>My Groups</div>
          {myGroups.map((g) => <GroupRow key={g.id} g={g} onJoin={handleJoin} joining={joiningId === g.id} />)}
        </>
      )}

      {!loading && !error && (
        <>
          <div style={sectionLabelStyle}>Discover Public Groups</div>
          {discoverGroups.length === 0 && (
            <EmptyState message="No public groups yet — be the first to create one." />
          )}
          {discoverGroups.map((g) => <GroupRow key={g.id} g={g} onJoin={handleJoin} joining={joiningId === g.id} />)}
        </>
      )}
    </div>
  );
}

function GroupRow({ g, onJoin, joining }: { g: Group; onJoin: (g: Group) => void; joining: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
      <Avatar name={g.name} color={g.avatar_color} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{g.name}</div>
        <div style={{ fontSize: 12, color: COLORS.textFaint }}>{g.member_count} member{g.member_count === 1 ? '' : 's'}{g.description ? ` · ${g.description}` : ''}</div>
      </div>
      {g.isMember ? (
        <Link href={`/groups/${g.id}`} style={{ padding: '7px 14px', borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, color: COLORS.inkSoft, fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>Open</Link>
      ) : (
        <button
          onClick={() => onJoin(g)}
          disabled={joining}
          style={{ padding: '7px 14px', borderRadius: RADIUS.sm, border: 'none', background: COLORS.violet, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          {joining ? 'Joining…' : 'Join'}
        </button>
      )}
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase',
  letterSpacing: '.03em', padding: '14px 20px 6px 20px'
};
