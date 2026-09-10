'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import PageHeader from '@/components/PageHeader';
import Avatar from '@/components/Avatar';
import CategoryIcon from '@/components/CategoryIcon';
import VerifiedBadge from '@/components/VerifiedBadge';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';
import { getActivityTimeState } from '@/lib/activityTimeState';
import { useTimeStateTick } from '@/lib/activityTimeStateHooks';
import { useTimeFormat } from '@/lib/timeFormat';

type Tab = 'all' | 'activities' | 'people' | 'places' | 'categories';

type Attendee = { id: string; name: string; avatar_color: string; avatar_url: string | null };
type ActivityResult = {
  id: string; title: string; category: string; cover_image_url: string | null;
  starts_at: string; ends_at: string | null; address: string | null; capacity: number; spots_remaining: number;
  profiles: { id: string; name: string; is_verified_organizer?: boolean } | null;
  attendees: Attendee[]; isSaved: boolean;
};
type PersonResult = { id: string; name: string; handle: string; avatar_color: string; avatar_url: string | null; isFollowing: boolean; interests: string[] };
type Category = { key: string; label: string; icon: string };

const RECENT_SEARCHES_KEY = 'tidingspace_recent_searches';
const MAX_RECENT = 8;

function loadRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveRecentSearch(q: string) {
  if (typeof window === 'undefined' || !q.trim()) return;
  const existing = loadRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase());
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([q, ...existing].slice(0, MAX_RECENT)));
}

const TABS: { key: Tab; label: string; icon: (c: string) => React.ReactNode }[] = [
  { key: 'all', label: 'All', icon: (c) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> },
  { key: 'activities', label: 'Activities', icon: (c) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg> },
  { key: 'people', label: 'People', icon: (c) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> },
  { key: 'places', label: 'Places', icon: (c) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg> },
  { key: 'categories', label: 'Categories', icon: (c) => <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg> }
];

export default function SearchPage() {
  const supabase = createClient();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const tickNow = useTimeStateTick();
  const { formatTime } = useTimeFormat();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<{ activities: ActivityResult[]; people: PersonResult[] } | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRecentSearches(loadRecentSearches());
    fetch('/api/categories').then((r) => r.json()).then((json) => setCategories(json.categories || [])).catch(() => {});
  }, []);

  // Runs both for an actual query AND for the empty/browse state — the API
  // itself decides which real data to return either way; this page never
  // needs to know the difference.
  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      setResults(json);
      setFollowingIds(new Set(json.people.filter((p: PersonResult) => p.isFollowing).map((p: PersonResult) => p.id)));
      setSavedIds(new Set(json.activities.filter((a: ActivityResult) => a.isSaved).map((a: ActivityResult) => a.id)));
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  function commitSearch(q: string) {
    setQuery(q);
    saveRecentSearch(q);
    setRecentSearches(loadRecentSearches());
  }

  async function toggleFollow(personId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/login'; return; }
    const isFollowing = followingIds.has(personId);
    const next = new Set(followingIds);
    isFollowing ? next.delete(personId) : next.add(personId);
    setFollowingIds(next);
    await fetch(`/api/follows/${personId}`, { method: isFollowing ? 'DELETE' : 'POST' });
  }

  async function toggleSave(activityId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/login'; return; }
    const isSaved = savedIds.has(activityId);
    const next = new Set(savedIds);
    isSaved ? next.delete(activityId) : next.add(activityId);
    setSavedIds(next);
    await fetch(`/api/saved/activities/${activityId}`, { method: isSaved ? 'DELETE' : 'POST' });
  }

  const categoryIcon = (key: string) => categories.find((c) => c.key === key)?.icon ?? '/icons/categories/sports.svg';
  const hasQuery = query.trim().length > 0;

  const activities = results?.activities ?? [];
  const people = results?.people ?? [];
  const showActivities = tab === 'all' || tab === 'activities';
  const showPeople = tab === 'all' || tab === 'people';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 90, minHeight: '100vh', background: '#FBFAFF' }}>
      <style>{`
        .ts-result-card { transition: background 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease; }
        .ts-result-card:hover { background: #fff; box-shadow: ${SHADOW.card}; }
        .ts-result-card:active { transform: scale(0.99); }
        .ts-chip { transition: background 0.12s ease, box-shadow 0.12s ease; }
        .ts-chip:hover { box-shadow: ${SHADOW.card}; }
      `}</style>

      <PageHeader title="Search" backHref="/" />

      {/* Search bar + filter button */}
      <div style={{ padding: '0 20px 16px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 16 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitSearch(query)}
            placeholder="Search activities, people, places…"
            style={{
              width: '100%', padding: hasQuery ? '15px 44px 15px 46px' : '15px 16px 15px 46px',
              borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, background: '#fff',
              fontSize: 14.5, outline: 'none', boxSizing: 'border-box', boxShadow: SHADOW.card
            }}
          />
          {hasQuery && (
            <button onClick={() => setQuery('')} aria-label="Clear search" style={{ position: 'absolute', right: 14, width: 22, height: 22, borderRadius: '50%', background: COLORS.surfaceAlt, border: 'none', color: COLORS.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13 }}>✕</button>
          )}
        </div>
        <button aria-label="Filters" style={{ width: 46, height: 46, borderRadius: '50%', border: `1px solid ${COLORS.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', boxShadow: SHADOW.card }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><circle cx="9" cy="6" r="2" fill="#fff" /><line x1="4" y1="12" x2="20" y2="12" /><circle cx="15" cy="12" r="2" fill="#fff" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="9" cy="18" r="2" fill="#fff" /></svg>
        </button>
      </div>

      {/* Tabs — always visible, matching browse-vs-search using the same layout */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 14px 16px', borderBottom: `1px solid ${COLORS.border}`, overflowX: 'auto' }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: 'none', background: 'none',
                borderBottom: active ? `2px solid ${COLORS.violet}` : '2px solid transparent',
                color: active ? COLORS.violet : COLORS.textSecondary, fontWeight: active ? 700 : 600, fontSize: 13.5,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
              }}
            >
              {t.icon(active ? COLORS.violet : COLORS.textFaint)}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Popular Searches — real categories, not invented topics */}
      {!hasQuery && (
        <div style={{ padding: '16px 20px 6px 20px' }}>
          <SectionLabel>Popular Searches</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
            {categories.slice(0, 8).map((c) => (
              <button key={c.key} className="ts-chip" onClick={() => commitSearch(c.label)} style={categoryChipStyle}>
                <CategoryIcon src={c.icon} size={15} /> {c.label}
              </button>
            ))}
          </div>

          {recentSearches.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SectionLabel>Recent Searches</SectionLabel>
                <button onClick={() => { window.localStorage.removeItem(RECENT_SEARCHES_KEY); setRecentSearches([]); }} style={{ background: 'none', border: 'none', color: COLORS.violet, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear all</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {recentSearches.map((s, i) => (
                  <button key={i} className="ts-chip" onClick={() => commitSearch(s)} style={{ ...recentChipStyle, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: COLORS.ink }}>{s}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <LoadingState message={hasQuery ? 'Searching…' : undefined} />}
      {error && <ErrorState message="Couldn't load this." onRetry={() => runSearch(query)} />}

      {!loading && !error && results && (
        <div style={{ padding: '10px 20px 0 20px' }}>
          {showActivities && activities.length > 0 && (
            <ResultSection title={hasQuery ? 'Activities' : 'Upcoming Activities'}>
              {activities.map((a) => (
                <ActivityCard key={a.id} activity={a} icon={categoryIcon(a.category)} now={tickNow} formatTime={formatTime} isSaved={savedIds.has(a.id)} onToggleSave={(e) => toggleSave(a.id, e)} />
              ))}
            </ResultSection>
          )}

          {showPeople && people.length > 0 && (
            <ResultSection title="People">
              {people.map((p) => (
                <PersonCard key={p.id} person={p} isFollowing={followingIds.has(p.id)} onToggleFollow={(e) => toggleFollow(p.id, e)} />
              ))}
            </ResultSection>
          )}

          {tab === 'places' && (
            <div style={{ marginBottom: 28 }}>
              <SectionLabel>Places</SectionLabel>
              <div style={{ marginTop: 12 }}>
                <EmptyState icon="📍" message={"Places aren't available yet.\nTiding Space currently focuses on activities, not standalone venues."} />
              </div>
            </div>
          )}

          {tab === 'categories' && (
            <div style={{ marginBottom: 28 }}>
              <SectionLabel>All Categories</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
                {categories.map((c) => (
                  <button key={c.key} className="ts-chip" onClick={() => { commitSearch(c.label); setTab('all'); }} style={categoryChipStyle}>
                    <CategoryIcon src={c.icon} size={15} /> {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasQuery && activities.length === 0 && people.length === 0 && tab !== 'places' && tab !== 'categories' && (
            <EmptyState icon="🔍" message={`No results found.\nTry another keyword, or browse activities nearby.`} />
          )}
        </div>
      )}

    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink, letterSpacing: '-0.01em' }}>{children}</div>;
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionLabel>{title}</SectionLabel>
        <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.violet, textDecoration: 'none' }}>See all</a>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function ActivityCard({ activity, icon, now, formatTime, isSaved, onToggleSave }: {
  activity: ActivityResult; icon: string; now: Date; formatTime: (d: Date | string) => string; isSaved: boolean; onToggleSave: (e: React.MouseEvent) => void;
}) {
  const timeState = getActivityTimeState(activity.starts_at, activity.ends_at, now);
  const isFull = activity.spots_remaining <= 0;
  return (
    <Link href={`/?activity=${activity.id}`} className="ts-result-card" style={{ ...cardStyle, alignItems: 'flex-start', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', width: '100%', padding: 12, gap: 13 }}>
        <div style={{ position: 'relative', width: 76, height: 76, borderRadius: RADIUS.md, flexShrink: 0, overflow: 'hidden', background: activity.cover_image_url ? undefined : COLORS.violetTint, backgroundImage: activity.cover_image_url ? `url(${activity.cover_image_url})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!activity.cover_image_url && <CategoryIcon src={icon} size={30} />}
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 22, height: 22, borderRadius: RADIUS.sm, background: COLORS.violet, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CategoryIcon src={icon} size={13} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.title}</div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: isFull ? COLORS.textFaint : COLORS.success, flexShrink: 0, whiteSpace: 'nowrap' }}>
              {isFull ? 'Full' : `${activity.spots_remaining} spot${activity.spots_remaining === 1 ? '' : 's'} left`}
            </span>
          </div>
          {activity.address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, color: COLORS.textSecondary }}>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={COLORS.textFaint} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.address}</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 12, color: COLORS.textSecondary }}>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={COLORS.textFaint} strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            {new Date(activity.starts_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTime(activity.starts_at)}
          </div>
          {activity.profiles?.name && (
            <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              by {activity.profiles.name}
              {activity.profiles.is_verified_organizer && <VerifiedBadge size={14} />}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0 12px 10px 100px' }}>
        {activity.attendees.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {activity.attendees.slice(0, 5).map((att, i) => (
              <div key={att.id} style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid #fff', borderRadius: '50%', flexShrink: 0 }}>
                <Avatar name={att.name} color={att.avatar_color} avatarUrl={att.avatar_url} pixelSize={24} />
              </div>
            ))}
            {activity.capacity - activity.spots_remaining > 5 && (
              <span style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 700, color: COLORS.violet, background: COLORS.violetTint, borderRadius: RADIUS.pill, padding: '3px 8px' }}>
                +{activity.capacity - activity.spots_remaining - 5}
              </span>
            )}
          </div>
        ) : <div />}
        <button onClick={onToggleSave} aria-label={isSaved ? 'Unsave' : 'Save'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isSaved ? COLORS.violet : COLORS.textFaint, padding: 4 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
        </button>
      </div>
    </Link>
  );
}

function PersonCard({ person, isFollowing, onToggleFollow }: { person: PersonResult; isFollowing: boolean; onToggleFollow: (e: React.MouseEvent) => void }) {
  return (
    <Link href={`/profile/${person.id}`} className="ts-result-card" style={cardStyle}>
      <Avatar name={person.name} color={person.avatar_color} avatarUrl={person.avatar_url} size="lg" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.ink }}>{person.name}</div>
        <div style={{ fontSize: 12.5, color: COLORS.textFaint, marginTop: 2 }}>@{person.handle}</div>
        {person.interests.length > 0 && (
          <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {person.interests.slice(0, 3).join(' · ')}
          </div>
        )}
      </div>
      <button onClick={onToggleFollow} style={{ padding: '8px 18px', borderRadius: RADIUS.pill, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0, border: isFollowing ? `1px solid ${COLORS.border}` : 'none', background: isFollowing ? '#fff' : COLORS.violet, color: isFollowing ? COLORS.ink : '#fff' }}>
        {isFollowing ? 'Following' : 'Follow'}
      </button>
    </Link>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 13, padding: '12px', borderRadius: RADIUS.lg,
  textDecoration: 'none', color: 'inherit', background: '#fff', border: `1px solid ${COLORS.borderLight}`
};
const recentChipStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: RADIUS.pill,
  background: '#fff', boxShadow: SHADOW.card
};
const categoryChipStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: RADIUS.pill,
  border: 'none', background: '#fff', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary,
  cursor: 'pointer', boxShadow: SHADOW.card
};
