'use client';

import { COLORS, RADIUS, SHADOW, FONT } from '@/lib/designTokens';
import CategoryIcon from '@/components/CategoryIcon';
import Avatar from '@/components/Avatar';
import ActivityTimeBadge from '@/components/ActivityTimeBadge';
import { getActivityTimeState } from '@/lib/activityTimeState';
import { useTimeStateTick } from '@/lib/activityTimeStateHooks';
import { useTimeFormat } from '@/lib/timeFormat';

const CATEGORY_DOT: Record<string, string> = {
  yoga: COLORS.success, hike: COLORS.success, dance: COLORS.like, language: '#378ADD',
  network: '#378ADD', concert: COLORS.violet, workshop: '#BA7517', volunteer: COLORS.success,
  bar: COLORS.like, sports: '#378ADD'
};

type ActivityEmbed = {
  id: string;
  title: string;
  category: string;
  cover_image_url: string | null;
  starts_at: string;
  ends_at?: string | null;
  address: string | null;
};

type Extras = {
  spots_remaining: number;
  attendees: { id: string; name: string; avatar_color: string; avatar_url?: string | null }[];
};

export default function ActivityPostCard({ activity, extras }: { activity: ActivityEmbed; extras: Extras | null }) {
  // Interim wiring note: Activity Details hasn't been rebuilt to match the mockup
  // yet — for now this opens the existing map-based detail sheet on the home
  // screen via a query param it reads.
  const href = `/?activity=${activity.id}`;
  const dotColor = CATEGORY_DOT[activity.category] ?? COLORS.violet;

  // Shared, low-frequency tick — this card recomputes its urgency state
  // every ~30s, not every second. See lib/activityTimeState.ts for why.
  const now = useTimeStateTick();
  const { formatTime } = useTimeFormat();
  const timeState = getActivityTimeState(activity.starts_at, activity.ends_at ?? null, now);

  return (
    <a
      href={href}
      style={{
        display: 'flex', textDecoration: 'none', color: 'inherit',
        border: `1px solid ${timeState === 'in_progress' || timeState === 'ending_soon' ? COLORS.success : COLORS.border}`,
        borderRadius: RADIUS.md,
        overflow: 'hidden', marginTop: 14, background: '#fff'
      }}
    >
      {/* Image — left, per mockup's horizontal split layout */}
      <div style={{
        width: '42%', flexShrink: 0, position: 'relative', minHeight: 118,
        background: activity.cover_image_url ? undefined : `linear-gradient(135deg, ${dotColor}22, ${dotColor}0D)`,
        backgroundImage: activity.cover_image_url ? `url(${activity.cover_image_url})` : undefined,
        backgroundSize: 'cover', backgroundPosition: 'center'
      }}>
        {!activity.cover_image_url && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CategoryIcon categoryKey={activity.category} size={34} />
          </div>
        )}
      </div>

      {/* Info — right */}
      <div style={{ flex: 1, padding: '12px 14px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: 7, background: dotColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CategoryIcon categoryKey={activity.category} size={13} />
          </div>
          <ActivityTimeBadge state={timeState} startsAt={activity.starts_at} now={now} />
        </div>
        <div style={{ ...FONT.cardTitle, color: COLORS.ink, marginBottom: 6 }}>{activity.title}</div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>
          {new Date(activity.starts_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          {' · '}
          {formatTime(activity.starts_at)}
        </div>
        {activity.address && (
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke={COLORS.textFaint} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.address}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex' }}>
            {(extras?.attendees ?? []).map((a, i) => (
              <div key={a.id} style={{ marginLeft: i === 0 ? 0 : -7, border: '2px solid #fff', borderRadius: '50%', flexShrink: 0, display: 'flex' }}>
                <Avatar name={a.name} color={a.avatar_color} avatarUrl={a.avatar_url} pixelSize={22} />
              </div>
            ))}
          </div>
          {extras && extras.spots_remaining > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: extras.spots_remaining <= 3 ? COLORS.success : COLORS.textFaint }}>
              {extras.spots_remaining} left
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
