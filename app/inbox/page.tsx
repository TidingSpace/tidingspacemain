'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import TopBarActions from '@/components/TopBarActions';
import ErrorState from '@/components/ErrorState';
import Avatar from '@/components/Avatar';
import CategoryIcon from '@/components/CategoryIcon';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { COLORS, RADIUS, SHADOW } from '@/lib/designTokens';
import { isOnline } from '@/lib/presence';

type Conversation = {
  partner: { id: string; name: string; avatar_color: string; avatar_url?: string | null; last_seen_at: string | null; is_verified_organizer?: boolean };
  lastMessage: string;
  lastAt: string;
  unread: boolean;
  unreadCount: number;
};

type Community = {
  activity: { id: string; title: string; category: string };
  lastMessage: string | null;
  lastAt: string | null;
};

type Group = {
  id: string;
  name: string;
  avatar_color: string;
  is_public: boolean;
  isMember: boolean;
  unreadCount: number;
};

type UserResult = { id: string; name: string; handle: string; avatar_color: string; avatar_url?: string | null };

function formatMessageTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export default function InboxPage() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<'dms' | 'groups'>('dms');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const loadInbox = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch('/api/conversations').then((r) => r.json()),
      fetch('/api/communities').then((r) => r.json()),
      fetch('/api/groups').then((r) => r.json())
    ]).then(([convJson, commJson, groupJson]) => {
      setConversations(convJson.conversations || []);
      setCommunities(commJson.communities || []);
      setGroups((groupJson.groups || []).filter((g: Group) => g.isMember));
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return; }
      setUser(data.user);
    });
    loadInbox();
  }, [supabase, loadInbox]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const handle = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then((r) => r.json())
        .then((json) => setSearchResults(json.users || []));
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const initials = user?.user_metadata?.name
    ? user.user_metadata.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')
    : (user?.email?.[0]?.toUpperCase() ?? '?');

  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c) => c.partner.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : conversations;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 90, background: '#fff', minHeight: '100vh' }}>

      {/* Header */}
      <PageHeader title="Messages" right={<TopBarActions avatarInitials={initials} />} />

      {/* Search + more */}
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 16px 20px', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.pill, padding: '11px 16px' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            id="inbox-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages"
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: 14.5, color: COLORS.ink, background: 'transparent' }}
          />
        </div>
        <button
          onClick={() => setMoreMenuOpen(!moreMenuOpen)}
          style={{ width: 44, height: 44, borderRadius: '50%', border: `1px solid ${COLORS.border}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          aria-label="More"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill={COLORS.ink}><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
        </button>

        {moreMenuOpen && (
          <div style={{ position: 'absolute', top: 52, right: 20, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.sm, boxShadow: SHADOW.raised, zIndex: 10, overflow: 'hidden', minWidth: 160 }}>
            <button
              onClick={() => { setMoreMenuOpen(false); document.getElementById('inbox-search-input')?.focus(); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none', background: 'none', color: COLORS.ink, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
            >
              New message
            </button>
          </div>
        )}
      </div>

      {/* Tabs — chip style, matching the mockup */}
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 16px 20px' }}>
        <ChipTab
          active={tab === 'dms'}
          onClick={() => setTab('dms')}
          label="Chats"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          }
        />
        <ChipTab
          active={tab === 'groups'}
          onClick={() => setTab('groups')}
          label="Groups"
          icon={
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          }
        />
      </div>

      {error ? (
        <ErrorState message="Couldn't load your messages." onRetry={loadInbox} />
      ) : (
        <>
      {/* ---------- CHATS TAB ---------- */}
      {tab === 'dms' && (
        <>
          {loading && <LoadingState />}

          {!loading && searchQuery.trim() && searchResults.length > 0 && (
            <>
              <div style={sectionLabelStyle}>People</div>
              {searchResults.map((u) => (
                <Link key={u.id} href={`/messages/${u.id}`} style={rowLinkStyle}>
                  <Avatar name={u.name} color={u.avatar_color} avatarUrl={u.avatar_url} size="lg" />
                  <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.ink }}>{u.name}</div>
                </Link>
              ))}
              <div style={sectionLabelStyle}>Conversations</div>
            </>
          )}

          {!loading && filteredConversations.length === 0 && (
            <EmptyState message={searchQuery.trim() ? 'No matching conversations.' : 'No conversations yet — search someone above to say hello.'} />
          )}

          {filteredConversations.map((c) => (
            <Link key={c.partner.id} href={`/messages/${c.partner.id}`} style={rowLinkStyle}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar name={c.partner.name} color={c.partner.avatar_color} avatarUrl={c.partner.avatar_url} size="lg" />
                <div style={onlineDotStyle(isOnline(c.partner.last_seen_at))} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: COLORS.ink }}>{c.partner.name}</div>
                <div style={previewStyle(c.unread)}>{c.lastMessage}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: COLORS.textFaint }}>{formatMessageTime(c.lastAt)}</span>
                {c.unreadCount > 0 && (
                  <span style={{ background: COLORS.violet, color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {c.unreadCount}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </>
      )}

      {/* ---------- GROUPS TAB (activity communities + custom groups) ---------- */}
      {tab === 'groups' && (
        <>
          <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px 20px' }}>
            <Link href="/groups/new" style={{ ...smallBtnStyle, background: COLORS.violet, color: '#fff', borderColor: COLORS.violet }}>+ New Group</Link>
            <Link href="/groups" style={smallBtnStyle}>Discover</Link>
          </div>

          {!loading && communities.length === 0 && groups.length === 0 && (
            <EmptyState message="No groups yet. Join an activity to get its group chat automatically, or create your own." />
          )}

          {groups.length > 0 && <div style={sectionLabelStyle}>My Groups</div>}
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} style={rowLinkStyle}>
              <Avatar name={g.name} color={g.avatar_color} size="lg" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: COLORS.ink }}>{g.name}</div>
                <div style={previewStyle(g.unreadCount > 0)}>{g.is_public ? 'Public group' : 'Private group'}</div>
              </div>
              {g.unreadCount > 0 && (
                <span style={{ background: COLORS.violet, color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {g.unreadCount}
                </span>
              )}
            </Link>
          ))}

          {communities.length > 0 && <div style={sectionLabelStyle}>Activity Chats</div>}
          {communities.map((c) => (
            <Link key={c.activity.id} href={`/communities/${c.activity.id}`} style={rowLinkStyle}>
              <div style={{ ...avatarStyle, background: COLORS.violetTint, color: COLORS.violetDeep, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CategoryIcon categoryKey={c.activity.category} size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: COLORS.ink }}>{c.activity.title}</div>
                <div style={previewStyle(false)}>{c.lastMessage || 'No messages yet'}</div>
              </div>
            </Link>
          ))}
        </>
      )}
        </>
      )}
    </div>
  );
}

function ChipTab({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: RADIUS.pill, border: 'none', cursor: 'pointer',
        background: active ? COLORS.violetTint : '#F5F4F8',
        color: active ? COLORS.violetDeep : COLORS.textSecondary,
        fontSize: 14, fontWeight: 700
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: '#fff',
  color: COLORS.violetDeep, fontSize: 12.5, fontWeight: 600, textDecoration: 'none'
};
const rowLinkStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
  borderBottom: `1px solid ${COLORS.border}`, textDecoration: 'none', color: 'inherit'
};
const avatarStyle: React.CSSProperties = {
  width: 56, height: 56, borderRadius: '50%', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, flexShrink: 0
};
function onlineDotStyle(online: boolean): React.CSSProperties {
  return {
    position: 'absolute', bottom: 2, right: 2, width: 13, height: 13, borderRadius: '50%',
    background: online ? '#3CCB6E' : '#B0B0B8', border: '2.5px solid #fff'
  };
}
const sectionLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '.03em', padding: '10px 20px 4px 20px'
};
function previewStyle(unread: boolean): React.CSSProperties {
  return {
    fontSize: 14, color: unread ? COLORS.ink : COLORS.textSecondary, fontWeight: unread ? 600 : 400,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3
  };
}
