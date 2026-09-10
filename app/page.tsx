'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { useBottomNavVisibility } from '@/lib/bottomNavVisibility';
import InviteToActivitySheet from '@/components/InviteToActivitySheet';
import { trackEvent } from '@/lib/analytics-client';
import { CATEGORY_GROUPS, dbCategoriesForGroup } from '@/lib/categoryGroups';
import TopBarActions from '@/components/TopBarActions';
import ErrorState from '@/components/ErrorState';
import CategoryIcon from '@/components/CategoryIcon';
import Avatar from '@/components/Avatar';
import { COLORS, SHADOW, FONT } from '@/lib/designTokens';
import { getActivityTimeState } from '@/lib/activityTimeState';
import { useLiveCountdown, useTimeStateTick } from '@/lib/activityTimeStateHooks';
import ActivityTimeBadge, { countdownLabel } from '@/components/ActivityTimeBadge';
import VerifiedBadge from '@/components/VerifiedBadge';
import PostSignupPushPrompt from '@/components/PostSignupPushPrompt';
import { useTimeFormat } from '@/lib/timeFormat';

// Mapbox GL is a large library (~200KB+) with no meaningful server-rendered
// output — dynamic + ssr:false keeps it entirely out of the initial JS bundle,
// loading it only once this component actually mounts in the browser.
const ActivityMap = dynamic(() => import('@/components/ActivityMap'), {
  ssr: false,
  loading: () => <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textMuted, fontSize: 13 }}>Loading map…</div>
});
import type { DateFilter } from '@/components/ActivityMap';

type Activity = {
  id: string;
  title: string;
  description: string;
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  starts_at: string;
  ends_at: string | null;
  price_cents: number;
  spots_remaining: number;
  capacity: number;
  my_rsvp_status: string | null;
  photo_urls: string[];
  cover_image_url: string | null;
  recurrence_rule: 'daily' | 'weekly' | 'monthly' | null;
  going_count: number;
  attendees_sample: { id: string; name: string; avatar_color: string; avatar_url?: string | null }[];
  profiles: { id: string; name: string; avatar_color?: string; avatar_url?: string | null; is_verified_organizer?: boolean };
};


export default function HomePage() {
  return (
    <Suspense fallback={<div style={{ height: '100vh' }} />}>
      <HomePageContent />
    </Suspense>
  );
}

function HomePageContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selected, setSelected] = useState<Activity | null>(null);
  const { setHidden: setBottomNavHidden } = useBottomNavVisibility();
  useEffect(() => {
    setBottomNavHidden(!!selected);
    return () => setBottomNavHidden(false);
  }, [selected, setBottomNavHidden]);
  // Shared, low-frequency tick for the map's own list-level state (pins
  // already re-tick independently inside ActivityMap); this one is for
  // anything on this page, outside the map, that also needs urgency state.
  const tickNow = useTimeStateTick();
  const { formatTime } = useTimeFormat();
  const selectedTimeState = selected ? getActivityTimeState(selected.starts_at, selected.ends_at ?? null, tickNow) : null;
  // Only the open Activity Details sheet is allowed to tick every second —
  // and only while it's actually showing a countdown-eligible state, not
  // for the sheet's entire open duration regardless of urgency.
  const showLiveCountdown = selectedTimeState === 'starting_very_soon' || selectedTimeState === 'starting_now';
  const liveCountdown = useLiveCountdown(selected?.starts_at ?? new Date().toISOString(), showLiveCountdown);
  const [joining, setJoining] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [detailTab, setDetailTab] = useState<'about' | 'comments' | 'photos' | 'similar'>('about');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [activitiesError, setActivitiesError] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Computes a local-day-aligned UTC range for the given filter. Using the
  // Date constructor's (year, month, day, ...) form always resolves against
  // the browser's own local timezone, so there's no manual UTC-offset
  // arithmetic anywhere here — exactly the kind of thing that causes
  // off-by-one-day bugs around midnight. .toISOString() then converts that
  // local instant into the UTC timestamp the database actually compares
  // against.
  //
  // 'today', 'tomorrow', 'next7' (previously labeled "This Week" in the old
  // horizontal chip row), and 'all' are the exact same computations as
  // before — unchanged. 'weekend', 'week' (a true Monday-Sunday calendar
  // week, distinct from the rolling 7-day 'next7'), and 'month' are new,
  // built with the same local-midnight technique as everything else here.
  function getDateRangeParams(filter: DateFilter): string {
    const now = new Date();
    const localMidnight = (daysFromToday: number) =>
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromToday, 0, 0, 0, 0);

    if (filter === 'today') return `from=${localMidnight(0).toISOString()}&to=${localMidnight(1).toISOString()}`;
    if (filter === 'tomorrow') return `from=${localMidnight(1).toISOString()}&to=${localMidnight(2).toISOString()}`;
    if (filter === 'next7') {
      // Rolling 7-day window starting today — this is the exact same
      // computation the old 'week' option used.
      return `from=${localMidnight(0).toISOString()}&to=${localMidnight(7).toISOString()}`;
    }
    if (filter === 'weekend') {
      // The upcoming Saturday+Sunday — if today already IS Saturday or
      // Sunday, "this weekend" means the one already in progress, not next
      // weekend.
      const day = now.getDay(); // 0=Sun..6=Sat
      const daysUntilSaturday = day === 6 ? 0 : day === 0 ? -1 : 6 - day;
      return `from=${localMidnight(daysUntilSaturday).toISOString()}&to=${localMidnight(daysUntilSaturday + 2).toISOString()}`;
    }
    if (filter === 'week') {
      // True calendar week, Monday-Sunday — distinct from the rolling
      // 'next7'. Runs from today through the end of the current week.
      const day = now.getDay(); // 0=Sun..6=Sat
      const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
      return `from=${localMidnight(0).toISOString()}&to=${localMidnight(daysUntilNextMonday).toISOString()}`;
    }
    if (filter === 'month') {
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      return `from=${localMidnight(0).toISOString()}&to=${startOfNextMonth.toISOString()}`;
    }
    // 'all' — show everything except activities that have DEFINITIVELY
    // ended (a known end time in the past). Deliberately does NOT exclude
    // activities that have already started but haven't ended yet — those
    // are exactly the ones showing as LIVE, and hiding them from "All" was
    // a real bug: an activity that's happening right now is arguably the
    // single most relevant thing "All" should include, not the one thing
    // it silently excluded.
    return `hideFinished=true`;
  }

  // Reads dateFilter via closure rather than taking it as a parameter —
  // several existing call sites elsewhere already call loadActivities() with
  // no arguments after an RSVP/save action, just to refresh spots-remaining;
  // this keeps every one of those working unchanged instead of needing to
  // update each to pass the current filter explicitly.
  const loadActivities = useCallback(async () => {
    setActivitiesError(false);
    try {
      const res = await fetch(`/api/activities?${getDateRangeParams(dateFilter)}`);
      const json = await res.json();
      if (json.activities) setActivities(json.activities);
      else setActivitiesError(true);
    } catch {
      setActivitiesError(true);
    }
  }, [dateFilter]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  // Deep link support: Feed's activity cards link here as /?activity=<id> —
  // interim wiring until Activity Details gets its own dedicated screen/route.
  useEffect(() => {
    const activityId = searchParams.get('activity');
    if (activityId) handleSelectActivity(activityId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Memoized so this stays the same array reference across re-renders that
  // don't actually change `activities` or `selectedGroup` — without this,
  // every render (typing in the comment box, toggling a menu, anything)
  // produced a brand-new array via .filter(), which fed into ActivityMap's
  // marker-rebuild effect (keyed on this exact prop) and tore down/recreated
  // every single map marker on every unrelated re-render of this page.
  const visibleActivities = useMemo(
    () => selectedGroup === 'all'
      ? activities
      : activities.filter((a) => dbCategoriesForGroup(selectedGroup).includes(a.category)),
    [activities, selectedGroup]
  );

  // useCallback for the same reason as visibleActivities above — this is
  // passed to ActivityMap as onSelectActivity, and its identity is also a
  // dependency of that same marker-rebuild effect. All its dependencies
  // (setters) are stable, so an empty array is correct here.
  const handleSelectActivity = useCallback(async (id: string) => {
    const res = await fetch(`/api/activities/${id}`);
    const json = await res.json();
    setSelected(json.activity);
    setJoinMessage(null);
    setAgreedToTerms(false);
    setIsSaved(false);
    setDetailTab('about');
    setPhotoIndex(0);
    setComments([]);
    setMoreMenuOpen(false);
  }, []);

  async function loadComments(activityId: string) {
    setLoadingComments(true);
    const res = await fetch(`/api/activities/${activityId}/comments`);
    const json = await res.json();
    setComments(json.comments || []);
    setLoadingComments(false);
  }

  async function handleSubmitComment() {
    if (!selected) return;
    if (!user) { window.location.href = '/login'; return; }
    if (!commentText.trim()) return;
    const res = await fetch(`/api/activities/${selected.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: commentText.trim() })
    });
    const json = await res.json();
    if (json.comment) {
      setComments((prev) => [...prev, json.comment]);
      setCommentText('');
    } else if (json.error) {
      alert(json.error);
    }
  }

  function selectDetailTab(tab: 'about' | 'comments' | 'photos' | 'similar') {
    setDetailTab(tab);
    if (tab === 'comments' && selected) loadComments(selected.id);
  }

  async function handleToggleSave() {
    if (!selected) return;
    if (!user) { window.location.href = '/login'; return; }
    if (isSaved) {
      await fetch(`/api/saved/activities/${selected.id}`, { method: 'DELETE' });
      setIsSaved(false);
    } else {
      await fetch(`/api/saved/activities/${selected.id}`, { method: 'POST' });
      setIsSaved(true);
    }
  }

  async function handleReportActivity() {
    if (!selected) return;
    const reason = prompt('Why are you reporting this activity? (e.g., Spam, Misleading, Inappropriate, Safety concern)');
    if (!reason) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_activity_id: selected.id, reason })
    });
    const json = await res.json();
    if (json.error) { alert(json.error); return; }
    alert('Thanks — this has been reported for review.');
  }

  async function handleJoin() {
    if (!user) { window.location.href = '/login'; return; }
    if (!selected) return;

    setJoining(true);
    const res = await fetch('/api/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity_id: selected.id })
    });
    const json = await res.json();
    setJoining(false);

    if (json.error) {
      setJoinMessage(json.error);
    } else {
      setJoinMessage(json.rsvp.status === 'confirmed' ? "You're in! 🎉" : "Activity is full — you're on the waitlist.");
      loadActivities();
      handleSelectActivity(selected.id); // refresh my_rsvp_status so the UI updates immediately
    }
  }

  async function handleLeave() {
    if (!selected) return;
    if (!confirm('Cancel your spot in this activity?')) return;

    setJoining(true);
    await fetch(`/api/rsvp?activity_id=${selected.id}`, { method: 'DELETE' });
    setJoining(false);
    setJoinMessage(null);
    loadActivities();
    handleSelectActivity(selected.id);
  }

  async function handleCancelActivity() {
    if (!selected) return;
    if (!confirm(
      "Cancel this activity for everyone? This can't be undone. Everyone who joined (confirmed, waitlisted, or checked in) will be notified automatically."
    )) return;

    setCancelling(true);
    const res = await fetch(`/api/activities/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' })
    });
    setCancelling(false);

    if (!res.ok) {
      alert("Couldn't cancel the activity — please try again.");
      return;
    }

    setSelected(null); // close the sheet
    loadActivities(); // marker disappears since the list only returns status='active'
  }

  // TODO(Phase 1 — Notifications screen not built yet): wire this to /notifications
  // once that screen exists. Placeholder keeps the bell visually present per mockup.
  const initials = user?.user_metadata?.name
    ? user.user_metadata.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('')
    : (user?.email?.[0]?.toUpperCase() ?? '?');

  // photo_urls is a separate multi-photo gallery with no upload UI anywhere
  // yet, so it's empty for every activity today — fall back to
  // cover_image_url (what Create Activity actually uploads to) so the photo
  // people did upload actually shows up here.
  const galleryPhotos = selected
    ? (selected.photo_urls?.length ? selected.photo_urls : (selected.cover_image_url ? [selected.cover_image_url] : []))
    : [];

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: 480, margin: '0 auto', overflow: 'hidden', background: COLORS.white }}>
      <PostSignupPushPrompt />
      <style>{`
        .ts-map-control { transition: background 0.15s ease, box-shadow 0.15s ease, transform 0.08s ease; }
        .ts-map-control:hover { background: ${COLORS.borderLight}; }
        .ts-map-control:active { transform: scale(0.97); }
        .ts-chip-btn { transition: background 0.15s ease, color 0.15s ease; }
        @keyframes tsSheetUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ts-sheet-in { animation: tsSheetUp 220ms ease; }
      `}</style>

      {/* ---------- TOP HEADER ---------- */}
      <div style={{ flexShrink: 0, padding: '14px 16px 0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <img src="/icon-192.png" alt="" width={26} height={26} style={{ borderRadius: 8 }} />
            <b style={{ ...FONT.cardTitle, color: COLORS.ink }}>Tiding Space</b>
          </div>
          <TopBarActions avatarInitials={initials} />
        </div>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Link href="/search" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, background: '#fff', borderRadius: 14, padding: '12px 15px', boxShadow: '0 2px 10px rgba(20,10,40,0.09)', textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={COLORS.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span style={{ flex: 1, fontSize: 14, color: COLORS.textMuted, letterSpacing: '-0.01em' }}>What do you feel like doing?</span>
          </Link>
          <button className="ts-map-control" style={{ width: 44, height: 44, borderRadius: 14, border: 'none', background: '#fff', boxShadow: '0 2px 10px rgba(20,10,40,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          </button>
        </div>

        {/* Category chips — broad groups, mapped to real DB categories in lib/categoryGroups.ts */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          <CategoryChip
            active={selectedGroup === 'all'}
            onClick={() => setSelectedGroup('all')}
            icon={<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
            label="All"
          />
          {CATEGORY_GROUPS.map((g) => (
            <CategoryChip
              key={g.key}
              active={selectedGroup === g.key}
              onClick={() => setSelectedGroup(g.key)}
              icon={<img src={g.groupIconPath} width={16} height={16} alt="" style={{ objectFit: 'contain' }} />}
              label={g.label}
            />
          ))}
          <CategoryChip
            active={false}
            onClick={() => alert('More categories — coming soon.')}
            icon={<span style={{ fontSize: 14, letterSpacing: '-1px' }}>•••</span>}
            label="More"
          />
        </div>
      </div>

      {/* ---------- MAP ----------
          Per explicit product decision: the map is NOT full-bleed. It sits inside
          a centered, margined container with rounded corners, matching the mockup —
          this is deliberate layout, not something to "improve" toward more map space. */}
      <div style={{ flex: 1, position: 'relative', margin: '0 16px 90px 16px', borderRadius: 24, overflow: 'hidden', boxShadow: '0 4px 20px rgba(20,10,40,0.1)', background: '#fff' }}>
        {activitiesError ? (
          <ErrorState message="Couldn't load activities on the map." onRetry={loadActivities} />
        ) : (
          <ActivityMap activities={visibleActivities} onSelectActivity={handleSelectActivity} dateFilter={dateFilter} onDateFilterChange={setDateFilter} />
        )}
      </div>

      {/* ---------- ACTIVITY DETAIL SHEET ---------- */}
      {selected && (
        <div className="ts-sheet-in" style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 45,
          background: '#fff', borderRadius: '20px 20px 0 0',
          boxShadow: '0 -12px 32px rgba(61,36,112,0.14)',
          maxWidth: 480, margin: '0 auto', maxHeight: '88%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Header — back, title, share, more (matches the mockup's actual header row) */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}`, position: 'relative' }}>
            <button onClick={() => setSelected(null)} style={circleHeaderBtnStyle} aria-label="Back">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <b style={{ fontSize: 16, color: COLORS.ink }}>Activity Details</b>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { navigator.clipboard?.writeText(window.location.origin + '/?activity=' + selected.id); trackEvent('activity_shared', { category: selected.category }); alert('Link copied.'); }} style={circleHeaderBtnStyle} aria-label="Share">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
              </button>
              {(user?.id === selected.profiles?.id || selected.my_rsvp_status === 'confirmed' || selected.my_rsvp_status === 'checked_in') && (
                <button onClick={() => setInviteOpen(true)} style={circleHeaderBtnStyle} aria-label="Invite">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></svg>
                </button>
              )}
              <button onClick={() => setMoreMenuOpen(!moreMenuOpen)} style={circleHeaderBtnStyle} aria-label="More">
                <svg viewBox="0 0 24 24" width="17" height="17" fill={COLORS.ink}><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </button>
            </div>
            {moreMenuOpen && (
              <div style={{ position: 'absolute', top: 50, right: 16, background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: 12, boxShadow: SHADOW.raised, zIndex: 10, overflow: 'hidden', minWidth: 170 }}>
                {user?.id === selected.profiles?.id ? (
                  <>
                    <Link href={`/activities/${selected.id}/edit`} style={moreMenuItemStyle}>Edit Activity</Link>
                    <Link href={`/activities/${selected.id}/manage`} style={moreMenuItemStyle}>Manage attendees</Link>
                    <button onClick={() => { setMoreMenuOpen(false); handleCancelActivity(); }} disabled={cancelling} style={{ ...moreMenuItemStyle, color: COLORS.danger }}>
                      {cancelling ? 'Cancelling…' : 'Cancel Activity'}
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setMoreMenuOpen(false); handleReportActivity(); }} style={{ ...moreMenuItemStyle, color: COLORS.danger }}>Report</button>
                )}
              </div>
            )}
            {inviteOpen && <InviteToActivitySheet activityId={selected.id} onClose={() => setInviteOpen(false)} />}
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Hero photo carousel — falls back to cover_image_url (the field
                Create Activity actually uploads to) when photo_urls (a
                separate multi-photo gallery with no upload UI yet) is empty,
                which is every activity today. */}
            <div style={{ position: 'relative', height: 190 }}>
              <div style={{
                position: 'absolute', inset: 0, overflow: 'hidden',
                background: galleryPhotos[photoIndex] ? undefined : `linear-gradient(135deg, ${COLORS.violet}22, ${COLORS.violet}0D)`,
                backgroundImage: galleryPhotos[photoIndex] ? `url(${galleryPhotos[photoIndex]})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48
              }}>
                {!galleryPhotos[photoIndex] && <CategoryIcon categoryKey={selected.category} size={40} />}
              </div>
              {galleryPhotos.length > 1 && (
                <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 100 }}>
                  {photoIndex + 1}/{galleryPhotos.length}
                </div>
              )}
              {/* Category badge overlapping the bottom-left of the photo itself, not hanging below it */}
              <div style={{
                position: 'absolute', bottom: 10, left: 14, width: 40, height: 40, borderRadius: 12,
                background: COLORS.violet, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                boxShadow: '0 4px 12px rgba(122,90,248,0.4)'
              }}>
                <CategoryIcon categoryKey={selected.category} size={22} />
              </div>
            </div>

            <div style={{ padding: '18px 20px 20px 20px' }}>
              <h2 style={{ ...FONT.sectionTitle, margin: '0 0 10px 0' }}>{selected.title}</h2>

              {selectedTimeState && (
                <div style={{ marginBottom: 8 }}>
                  <ActivityTimeBadge state={selectedTimeState} startsAt={selected.starts_at} now={tickNow} context="detail" />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: COLORS.textSecondary, marginBottom: 8 }}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={COLORS.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                {showLiveCountdown ? (
                  <span style={{ fontWeight: 700, color: COLORS.violetDeep }}>{countdownLabel(selected.starts_at, tickNow)}</span>
                ) : (
                  <>
                    {new Date(selected.starts_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    {' • '}
                    {formatTime(selected.starts_at)}
                    {selected.ends_at ? ` – ${formatTime(selected.ends_at)}` : ''}
                  </>
                )}
              </div>

              {selected.recurrence_rule && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: COLORS.violetDeep, marginBottom: 8 }}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                  Repeats {selected.recurrence_rule} — this is one occurrence; joining it won't join the others.
                </div>
              )}

              {/* Location row — real address if the organizer set one, static thumbnail placeholder since we don't generate real static map images */}
              {selected.address && (
                <div
                  onClick={() => alert('Full map view — coming soon.')}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.address}</div>
                  </div>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: COLORS.violetTint, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🗺️</div>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
                </div>
              )}

              <div style={{ height: 1, background: COLORS.border, margin: '4px 0 16px 0' }} />

              {/* Hosted by + Going stat */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Link href={`/profile/${selected.profiles?.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <Avatar name={selected.profiles?.name || '?'} color={selected.profiles?.avatar_color} avatarUrl={selected.profiles?.avatar_url} size="md" />
                  <div>
                    <div style={{ fontSize: 11, color: COLORS.textFaint }}>Hosted by</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {selected.profiles?.name}
                      {selected.profiles?.is_verified_organizer && <VerifiedBadge size={16} />}
                    </div>
                  </div>
                </Link>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.ink }}>{selected.going_count}</div>
                  <div style={{ fontSize: 11, color: COLORS.textFaint }}>Going</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <button onClick={handleToggleSave} style={{ background: 'none', border: 'none', color: isSaved ? COLORS.violet : COLORS.textFaint, fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: isSaved ? 700 : 400 }}>
                  {isSaved ? '★ Saved' : '☆ Save this activity'}
                </button>
              </div>

              {/* People going */}
              {selected.going_count > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <b style={{ fontSize: 14, color: COLORS.ink }}>People going ({selected.going_count})</b>
                    <span onClick={() => alert('Full attendee list — coming soon.')} style={{ fontSize: 12.5, color: COLORS.violet, fontWeight: 700, cursor: 'pointer' }}>See all</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {selected.attendees_sample.slice(0, 8).map((a) => (
                      <Avatar key={a.id} name={a.name} color={a.avatar_color} avatarUrl={a.avatar_url} size="sm" />
                    ))}
                    {selected.going_count > selected.attendees_sample.length && (
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: COLORS.surfaceAlt, color: COLORS.violetDeep, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        +{selected.going_count - selected.attendees_sample.length}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Stats — one row of four, matching the mockup */}
              <div style={{ display: 'flex', border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: '14px 8px', marginBottom: 20 }}>
                <StatBox icon="👥" label="Spots" value={String(selected.spots_remaining)} />
                <StatBox icon="🏷️" label="Price" value={selected.price_cents === 0 ? 'Free' : `$${(selected.price_cents / 100).toFixed(2)}`} />
                <StatBox icon="🌐" label="Visibility" value="Public" />
                <StatBox icon={<CategoryIcon categoryKey={selected.category} size={18} />} label="Category" value={CATEGORY_GROUPS.find((g) => g.dbCategories.includes(selected.category))?.label ?? selected.category} />
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 18, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 14 }}>
                <DetailTabBtn label="About" active={detailTab === 'about'} onClick={() => selectDetailTab('about')} />
                <DetailTabBtn label={`Comments${comments.length ? ` (${comments.length})` : ''}`} active={detailTab === 'comments'} onClick={() => selectDetailTab('comments')} />
                <DetailTabBtn label={`Photos${galleryPhotos.length ? ` (${galleryPhotos.length})` : ''}`} active={detailTab === 'photos'} onClick={() => selectDetailTab('photos')} />
                <DetailTabBtn label="Similar" active={detailTab === 'similar'} onClick={() => selectDetailTab('similar')} />
              </div>

              {detailTab === 'about' && (
                <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 8 }}>{selected.description}</p>
              )}

              {detailTab === 'comments' && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                      placeholder="Ask a question or leave a comment…"
                      style={{ flex: 1, padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}`, fontSize: 13.5 }}
                    />
                    <button onClick={handleSubmitComment} style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      Post
                    </button>
                  </div>
                  {loadingComments && <p style={{ fontSize: 13, color: COLORS.textFaint }}>Loading…</p>}
                  {!loadingComments && comments.length === 0 && <p style={{ fontSize: 13, color: COLORS.textFaint }}>No comments yet — ask the first question.</p>}
                  {comments.map((c) => (
                    <div key={c.id} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <Avatar name={c.author?.name || '?'} color={c.author?.avatar_color} avatarUrl={c.author?.avatar_url} pixelSize={28} verified={c.author?.is_verified_organizer} />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {c.author?.name}
                        </div>
                        <div style={{ fontSize: 13, color: COLORS.ink }}>{c.text}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {detailTab === 'photos' && (
                <div style={{ marginBottom: 8 }}>
                  {galleryPhotos.length === 0 ? (
                    <p style={{ fontSize: 13, color: COLORS.textFaint }}>No photos yet.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                      {galleryPhotos.map((url, i) => (
                        <div key={i} onClick={() => setPhotoIndex(i)} style={{ aspectRatio: '1/1', borderRadius: 8, backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'pointer' }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'similar' && (
                <p style={{ fontSize: 13, color: COLORS.textFaint, marginBottom: 8 }}>
                  Similar activities — coming soon (needs a recommendation system, not built yet).
                </p>
              )}
            </div>
          </div>

          {/* Sticky action bar — Save + Join (no "Interested" per decision), outside the scroll area */}
          <div style={{ flexShrink: 0, borderTop: `1px solid ${COLORS.border}`, padding: `12px 20px calc(12px + env(safe-area-inset-bottom, 0px)) 20px`, background: '#fff' }}>
            {selected.my_rsvp_status === 'confirmed' || selected.my_rsvp_status === 'checked_in' ? (
              <div style={{ background: COLORS.successTint, borderRadius: 12, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.success }}>✓ You're going</span>
                <button onClick={handleLeave} disabled={joining} style={{ background: 'none', border: 'none', color: COLORS.textSecondary, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                  {joining ? 'Cancelling…' : 'Cancel my spot'}
                </button>
              </div>
            ) : selected.my_rsvp_status === 'waitlisted' ? (
              <div style={{ background: COLORS.warningBg, borderRadius: 12, padding: '11px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.warningAmber }}>Waitlisted</span>
                <button onClick={handleLeave} disabled={joining} style={{ background: 'none', border: 'none', color: COLORS.textSecondary, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                  {joining ? 'Cancelling…' : 'Leave waitlist'}
                </button>
              </div>
            ) : selectedTimeState === 'finished' ? (
              <div style={{ background: COLORS.surfaceAlt, borderRadius: 12, padding: '13px 16px', textAlign: 'center' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.textSecondary }}>This activity has ended</span>
              </div>
            ) : (
              <>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: COLORS.textSecondary, marginBottom: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>
                    I accept the <a href="/legal/terms" target="_blank" style={{ color: COLORS.violet }}>Terms of Service</a> and liability waiver.
                  </span>
                </label>
                {selected.price_cents > 0 && (
                  <p style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>
                    💵 Pay ${(selected.price_cents / 100).toFixed(2)} directly to the organizer — Tiding Space doesn't collect payment.
                  </p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleToggleSave} style={{ width: 48, borderRadius: 12, border: `1px solid ${COLORS.border}`, background: '#fff', cursor: 'pointer', color: isSaved ? COLORS.violet : COLORS.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Save">
                    <svg viewBox="0 0 24 24" width="19" height="19" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                  </button>
                  <button
                    onClick={handleJoin}
                    disabled={joining || !agreedToTerms}
                    style={{
                      flex: 1, padding: 13, borderRadius: 12, border: 'none',
                      background: agreedToTerms ? COLORS.violet : COLORS.disabledBg, color: '#fff', fontWeight: 700,
                      cursor: agreedToTerms ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {joining ? 'Joining…' : 'Join Activity'}
                  </button>
                </div>
              </>
            )}
            {joinMessage && <p style={{ marginTop: 8, fontSize: 12.5, color: COLORS.success }}>{joinMessage}</p>}
          </div>
        </div>
      )}

    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 16, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.ink }}>{value}</div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function DetailTabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', padding: '0 0 10px 0', cursor: 'pointer',
        fontSize: 13, fontWeight: active ? 700 : 500,
        color: active ? COLORS.violet : COLORS.textMuted,
        borderBottom: active ? `2px solid ${COLORS.violet}` : '2px solid transparent'
      }}
    >
      {label}
    </button>
  );
}

const circleHeaderBtnStyle: React.CSSProperties = {
  width: 34, height: 34, borderRadius: '50%', background: COLORS.surfaceAlt, border: 'none',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
};
const moreMenuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', border: 'none',
  background: 'none', color: COLORS.ink, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none'
};

function CategoryChip({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      <button
        className="ts-chip-btn"
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 15px', borderRadius: 100, border: 'none', cursor: 'pointer',
          background: active ? COLORS.violetTint : '#fff',
          color: active ? COLORS.violetDeep : COLORS.textSecondary,
          fontSize: 12.5, fontWeight: 600, lineHeight: 1,
          boxShadow: active ? 'none' : '0 2px 6px rgba(20,10,40,0.08)'
        }}
      >
        {icon}
        {label}
      </button>
      <div style={{ width: 16, height: 2.5, borderRadius: 2, background: active ? COLORS.violet : 'transparent', marginTop: 5, transition: 'background 0.15s ease' }} />
    </div>
  );
}
