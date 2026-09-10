'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-browser';
import CategoryIcon from '@/components/CategoryIcon';
import Avatar from '@/components/Avatar';
import ErrorState from '@/components/ErrorState';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { COLORS, RADIUS, FONT } from '@/lib/designTokens';

type Notification = {
  id: string;
  type: string;
  created_at: string;
  actor?: { id: string; name: string; avatar_color: string; avatar_url?: string | null } | null;
  activity?: { id: string; title: string; category: string; starts_at: string; address: string | null } | null;
  group?: { id: string; name: string; avatar_color: string; is_public: boolean } | null;
  groupMemberStatus?: 'active' | 'pending' | 'declined';
  activityInviteStatus?: 'pending' | 'accepted' | 'declined';
  post?: { id: string; text: string | null; image_url: string | null; image_urls: string[] | null } | null;
  broadcast?: { id: string; title: string; message: string; notification_type: string } | null;
  count?: number;
  actors_sample?: { id: string; name: string; avatar_color: string; avatar_url?: string | null }[];
};

// Category filter chips, mapped to the notification types that actually
// exist. There's deliberately no "Messages" category — new messages
// surface only in Messages itself, not here.
const FILTERS: { key: string; label: string; types: string[] | null }[] = [
  { key: 'all', label: 'All', types: null },
  { key: 'activities', label: 'Activities', types: ['activity_reminder', 'new_attendee', 'new_comment', 'activity_saved_aggregate', 'activity_cancelled', 'activity_invite'] },
  { key: 'people', label: 'People', types: ['new_follower', 'friend_joined_activity', 'group_invite'] },
  { key: 'updates', label: 'Updates', types: ['organizer_new_activity', 'post_liked', 'post_commented', 'admin_broadcast'] }
];

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isToday(dateStr: string): boolean {
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

export default function NotificationsPage() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [respondedInvites, setRespondedInvites] = useState<Record<string, 'accepted' | 'declined'>>({});

  async function handleRespondToInvite(notificationId: string, groupId: string, accept: boolean) {
    const res = await fetch(`/api/groups/${groupId}/members/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    setRespondedInvites((prev) => ({ ...prev, [notificationId]: accept ? 'accepted' : 'declined' }));
    if (accept) window.location.href = `/groups/${groupId}`;
  }

  async function handleRespondToActivityInvite(notificationId: string, activityId: string, accept: boolean) {
    const res = await fetch(`/api/activities/${activityId}/invite/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    setRespondedInvites((prev) => ({ ...prev, [notificationId]: accept ? 'accepted' : 'declined' }));
    if (accept) {
      // A separate call to the existing, already-tested RSVP endpoint
      // rather than duplicating its capacity/waitlist logic here — accept
      // still respects a full activity the same way tapping Join normally
      // would (falls back to waitlisted, doesn't just force a spot).
      await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_id: activityId })
      }).catch(() => {});
      window.location.href = `/?activity=${activityId}`;
    }
  }

  const loadNotifications = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch('/api/notifications')
      .then((r) => r.json())
      .then((json) => {
        if (json.notifications) setNotifications(json.notifications);
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
      if (!data.user) { window.location.href = '/login'; return; }
    });
    loadNotifications();
  }, [supabase, loadNotifications]);

  const activeFilter = FILTERS.find((f) => f.key === filter)!;
  const filtered = activeFilter.types === null
    ? notifications
    : notifications.filter((n) => activeFilter.types!.includes(n.type));

  const today = filtered.filter((n) => isToday(n.created_at) && n.type !== 'activity_reminder');
  const earlier = filtered.filter((n) => !isToday(n.created_at) && n.type !== 'activity_reminder');
  const reminders = filtered.filter((n) => n.type === 'activity_reminder');

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 90, background: '#fff', minHeight: '100vh' }}>
      <PageHeader
        title="Notifications"
        right={
          <button onClick={() => alert('Notification settings — coming soon.')} style={circleBtnStyle} aria-label="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 20px 16px 20px' }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              flexShrink: 0, padding: '8px 16px', borderRadius: RADIUS.pill, border: '1px solid ' + (filter === f.key ? COLORS.ink : COLORS.border),
              background: filter === f.key ? COLORS.ink : '#fff', color: filter === f.key ? '#fff' : COLORS.textSecondary,
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message="Couldn't load your notifications." onRetry={loadNotifications} />}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState message="Nothing here yet." />
      )}

      {reminders.map((n) => <ReminderRow key={n.id} n={n} />)}

      {today.length > 0 && <SectionLabel>Today</SectionLabel>}
      {today.map((n) => <NotificationRow key={n.id} n={n} respondedInvites={respondedInvites} onRespondToInvite={handleRespondToInvite} onRespondToActivityInvite={handleRespondToActivityInvite} />)}

      {earlier.length > 0 && <SectionLabel>Earlier</SectionLabel>}
      {earlier.map((n) => <NotificationRow key={n.id} n={n} respondedInvites={respondedInvites} onRespondToInvite={handleRespondToInvite} onRespondToActivityInvite={handleRespondToActivityInvite} />)}

    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '.05em', padding: '14px 20px 8px 20px' }}>{children}</div>;
}

function Row({ icon, iconBg, avatarUrl, avatarName, avatarHref, title, subtitle, time, extra, href }: {
  icon: React.ReactNode; iconBg: string; avatarUrl?: string | null; avatarName?: string; avatarHref?: string;
  title: React.ReactNode; subtitle?: React.ReactNode; time: string; extra?: React.ReactNode; href?: string;
}) {
  const avatarNode = avatarUrl ? (
    <Image src={avatarUrl} alt={avatarName || ''} width={42} height={42} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: 42, height: 42, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>
      {icon}
    </div>
  );

  return (
    <div className="ts-fade-in" style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
      {avatarHref ? (
        // stopPropagation so tapping the avatar (-> profile) never also
        // triggers the row's own href (-> activity/group/etc.) below it —
        // these are two independent destinations, not one link nested
        // inside another.
        <a href={avatarHref} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>{avatarNode}</a>
      ) : avatarNode}
      <div
        onClick={href ? () => { window.location.href = href; } : undefined}
        style={{ flex: 1, minWidth: 0, cursor: href ? 'pointer' : 'default' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: FONT.caption.fontSize, fontWeight: 400, color: COLORS.ink, lineHeight: FONT.caption.lineHeight }}>{title}</div>
          <span style={{ fontSize: 11, color: COLORS.textFaint, flexShrink: 0, whiteSpace: 'nowrap' }}>{time}</span>
        </div>
        {subtitle && <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginTop: 2 }}>{subtitle}</div>}
        {extra}
      </div>
    </div>
  );
}

function ReminderRow({ n }: { n: Notification }) {
  const a = n.activity;
  if (!a) return null;
  return (
    <Row
      icon="📅" iconBg={COLORS.violetTint}
      title={<>Your activity starts in less than an hour <span style={{ background: COLORS.violetTint, color: COLORS.violetDeep, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: RADIUS.pill, marginLeft: 4 }}>Upcoming</span></>}
      subtitle={<><CategoryIcon categoryKey={a.category} size={12} /> {a.title} — {new Date(a.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{a.address ? ` · ${a.address}` : ''}</>}
      time=""
      href={`/?activity=${a.id}`}
    />
  );
}

function NotificationRow({ n, respondedInvites, onRespondToInvite, onRespondToActivityInvite }: {
  n: Notification;
  respondedInvites?: Record<string, 'accepted' | 'declined'>;
  onRespondToInvite?: (notificationId: string, groupId: string, accept: boolean) => void;
  onRespondToActivityInvite?: (notificationId: string, activityId: string, accept: boolean) => void;
}) {
  const initials = (name?: string) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');

  if (n.type === 'new_attendee') {
    return (
      <Row
        icon={initials(n.actor?.name)} iconBg={n.actor?.avatar_color || COLORS.violet}
        avatarUrl={n.actor?.avatar_url} avatarName={n.actor?.name}
        avatarHref={n.actor ? `/profile/${n.actor.id}` : undefined}
        title={<><b>{n.actor?.name}</b> joined your activity</>}
        subtitle={n.activity?.title}
        time={timeAgo(n.created_at)}
        href={n.activity ? `/?activity=${n.activity.id}` : undefined}
      />
    );
  }
  if (n.type === 'new_comment') {
    return (
      <Row
        icon={initials(n.actor?.name)} iconBg={n.actor?.avatar_color || COLORS.violet}
        avatarUrl={n.actor?.avatar_url} avatarName={n.actor?.name}
        avatarHref={n.actor ? `/profile/${n.actor.id}` : undefined}
        title={<><b>{n.actor?.name}</b> commented on your activity</>}
        subtitle={n.activity?.title}
        time={timeAgo(n.created_at)}
        href={n.activity ? `/?activity=${n.activity.id}` : undefined}
      />
    );
  }
  if (n.type === 'activity_saved_aggregate') {
    return (
      <Row
        icon="♥" iconBg="#FCE8EE"
        title={<><b>{n.count} people</b> saved your activity</>}
        subtitle={n.activity?.title}
        time={timeAgo(n.created_at)}
        href={n.activity ? `/?activity=${n.activity.id}` : undefined}
        extra={
          <div style={{ display: 'flex', marginTop: 6 }}>
            {(n.actors_sample ?? []).map((a, i) => (
              <a
                key={a.id}
                href={`/profile/${a.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{ border: '2px solid #fff', borderRadius: '50%', marginLeft: i === 0 ? 0 : -7, display: 'flex' }}
              >
                <Avatar name={a.name} color={a.avatar_color} avatarUrl={a.avatar_url} pixelSize={22} />
              </a>
            ))}
          </div>
        }
      />
    );
  }
  if (n.type === 'new_follower') {
    return (
      <Row
        icon={initials(n.actor?.name)} iconBg={n.actor?.avatar_color || COLORS.violet}
        avatarUrl={n.actor?.avatar_url} avatarName={n.actor?.name}
        avatarHref={n.actor ? `/profile/${n.actor.id}` : undefined}
        title={<><b>{n.actor?.name}</b> started following you</>}
        time={timeAgo(n.created_at)}
        href={n.actor ? `/profile/${n.actor.id}` : undefined}
      />
    );
  }
  if (n.type === 'friend_joined_activity') {
    return (
      <Row
        icon={initials(n.actor?.name)} iconBg={n.actor?.avatar_color || COLORS.violet}
        avatarUrl={n.actor?.avatar_url} avatarName={n.actor?.name}
        avatarHref={n.actor ? `/profile/${n.actor.id}` : undefined}
        title={<><b>{n.actor?.name}</b> joined {n.activity?.title}</>}
        time={timeAgo(n.created_at)}
        href={n.activity ? `/?activity=${n.activity.id}` : undefined}
      />
    );
  }
  if (n.type === 'activity_invite') {
    const localResponse = respondedInvites?.[n.id];
    const responded = localResponse
      ? localResponse
      : n.activityInviteStatus === 'accepted' ? 'accepted'
      : n.activityInviteStatus === 'declined' ? 'declined'
      : null;
    return (
      <Row
        icon={initials(n.actor?.name)} iconBg={n.actor?.avatar_color || COLORS.violet}
        avatarUrl={n.actor?.avatar_url} avatarName={n.actor?.name}
        avatarHref={n.actor ? `/profile/${n.actor.id}` : undefined}
        title={<><b>{n.actor?.name}</b> invited you to <b>{n.activity?.title}</b></>}
        time={timeAgo(n.created_at)}
        extra={
          responded ? (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: responded === 'accepted' ? COLORS.success : COLORS.textFaint, marginTop: 6 }}>
              {responded === 'accepted' ? "✓ You're going" : 'Declined'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onRespondToActivityInvite?.(n.id, n.activity!.id, true); }}
                style={{ padding: '6px 16px', borderRadius: RADIUS.pill, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                Accept
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRespondToActivityInvite?.(n.id, n.activity!.id, false); }}
                style={{ padding: '6px 16px', borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.textSecondary, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                Decline
              </button>
            </div>
          )
        }
      />
    );
  }
  if (n.type === 'group_invite') {
    // Prefer the just-clicked local state (instant feedback, no round trip
    // needed to see the button change), but fall back to the real,
    // persisted status from the server — this is what actually fixes the
    // "reverts to Accept/Decline after reload" bug, since that status
    // survives a page reload and local state never did.
    const localResponse = respondedInvites?.[n.id];
    const responded = localResponse
      ? localResponse
      : n.groupMemberStatus === 'active' ? 'accepted'
      : n.groupMemberStatus === 'declined' ? 'declined'
      : null;
    return (
      <Row
        icon={initials(n.actor?.name)} iconBg={n.actor?.avatar_color || COLORS.violet}
        avatarUrl={n.actor?.avatar_url} avatarName={n.actor?.name}
        avatarHref={n.actor ? `/profile/${n.actor.id}` : undefined}
        title={<><b>{n.actor?.name}</b> added you to <b>{n.group?.name}</b></>}
        subtitle={n.group?.is_public ? 'Public group' : 'Private group'}
        time={timeAgo(n.created_at)}
        extra={
          responded ? (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: responded === 'accepted' ? COLORS.success : COLORS.textFaint, marginTop: 6 }}>
              {responded === 'accepted' ? '✓ Joined' : 'Declined'}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onRespondToInvite?.(n.id, n.group!.id, true); }}
                style={{ padding: '6px 16px', borderRadius: RADIUS.pill, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                Accept
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRespondToInvite?.(n.id, n.group!.id, false); }}
                style={{ padding: '6px 16px', borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, background: '#fff', color: COLORS.textSecondary, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
              >
                Decline
              </button>
            </div>
          )
        }
      />
    );
  }
  if (n.type === 'admin_broadcast') {
    const typeIcon = ({ information: 'ℹ️', announcement: '📣', warning: '⚠️', maintenance: '🛠️' } as Record<string, string>)[n.broadcast?.notification_type ?? 'information'] ?? 'ℹ️';
    return (
      <Row
        icon={typeIcon} iconBg={COLORS.violetTint}
        title={<b>{n.broadcast?.title ?? 'Announcement'}</b>}
        subtitle={n.broadcast?.message}
        time={timeAgo(n.created_at)}
      />
    );
  }
  if (n.type === 'organizer_new_activity') {
    return (
      <Row
        icon="📍" iconBg={COLORS.violetTint}
        title={<><b>{n.actor?.name}</b> published a new activity</>}
        subtitle={n.activity?.title}
        time={timeAgo(n.created_at)}
        href={n.activity ? `/?activity=${n.activity.id}` : undefined}
      />
    );
  }
  if (n.type === 'activity_cancelled') {
    return (
      <Row
        icon="🚫" iconBg="#FDEEDD"
        title={<>{n.activity?.title ? <>"<b>{n.activity.title}</b>" was cancelled</> : 'An activity you joined was cancelled'}</>}
        subtitle={n.actor?.name ? `Cancelled by ${n.actor.name}` : undefined}
        time={timeAgo(n.created_at)}
        href={n.activity ? `/?activity=${n.activity.id}` : undefined}
      />
    );
  }
  if (n.type === 'post_liked' || n.type === 'post_commented') {
    const thumbnail = n.post?.image_urls?.[0] || n.post?.image_url;
    return (
      <Row
        icon={initials(n.actor?.name)} iconBg={n.actor?.avatar_color || COLORS.violet}
        avatarUrl={n.actor?.avatar_url} avatarName={n.actor?.name}
        avatarHref={n.actor ? `/profile/${n.actor.id}` : undefined}
        title={<><b>{n.actor?.name}</b> {n.type === 'post_liked' ? 'liked your post' : 'commented on your post'}</>}
        subtitle={n.post?.text}
        time={timeAgo(n.created_at)}
        href={n.post ? `/feed/${n.post.id}` : undefined}
        extra={thumbnail && (
          <Image src={thumbnail} alt="" width={48} height={48} style={{ borderRadius: RADIUS.sm, objectFit: 'cover', marginTop: 6 }} />
        )}
      />
    );
  }
  return null;
}

const circleBtnStyle: React.CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', background: '#fff', border: `1px solid ${COLORS.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
};
