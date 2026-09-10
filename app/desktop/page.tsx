'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import DesktopActivityMap from '@/components/DesktopActivityMap';

type Activity = {
  id: string;
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  starts_at: string;
  price_cents: number;
  spots_remaining: number;
  profiles: { id: string; name: string };
};

const CATEGORY_ICONS: Record<string, string> = {
  yoga: '🧘', hike: '🥾', dance: '💃', language: '🗣️', network: '🤝',
  concert: '🎵', workshop: '🛠️', volunteer: '🌱', bar: '🍸', sports: '⚽'
};
const CATEGORY_COLORS: Record<string, string> = {
  yoga: '#7A5AF8', hike: '#4F8F5B', dance: '#E0568C', language: '#3D6FE0', network: '#8E3DE0',
  concert: '#7A5AF8', workshop: '#B3591F', volunteer: '#2E9E6B', bar: '#D14343', sports: '#2A9BA3'
};

// The mockup's top pills (Wellness/Sports/Music/Food/Arts/Learning) use a different,
// broader taxonomy than the app's actual 10 categories. Rather than faking this filter,
// this is a real grouping I designed mapping real categories into those buckets —
// genuinely functional, just a design decision worth knowing about. Adjust freely.
const CATEGORY_GROUPS: Record<string, string[]> = {
  Wellness: ['yoga'],
  Sports: ['hike', 'sports'],
  Music: ['concert'],
  Food: ['bar'],
  Arts: ['workshop', 'dance'],
  Learning: ['language', 'network', 'volunteer']
};

export default function DesktopHomePage() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('All');
  const [unreadChats, setUnreadChats] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [supabase]);

  const loadActivities = useCallback(async () => {
    const res = await fetch('/api/activities');
    const json = await res.json();
    if (json.activities) setActivities(json.activities);
  }, []);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  // Real unread count, not a placeholder — derived from the actual conversations API
  useEffect(() => {
    fetch('/api/conversations')
      .then((r) => r.json())
      .then((json) => {
        const count = (json.conversations || []).filter((c: any) => c.unread).length;
        setUnreadChats(count);
      });
  }, []);

  const filteredActivities = activities.filter((a) => {
    const matchesGroup = activeGroup === 'All' || (CATEGORY_GROUPS[activeGroup] || []).includes(a.category);
    const matchesSearch = !searchQuery.trim() ||
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  async function handleSelectActivity(id: string) {
    const res = await fetch(`/api/activities/${id}`);
    const json = await res.json();
    setSelected(json.activity);
    setJoinMessage(null);
    setAgreedToTerms(false);
    setIsSaved(false);
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
    }
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

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const upcoming = activities.slice(0, 3);
  const nearby = filteredActivities.slice(0, 6);

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#FAF9FF', overflow: 'hidden' }}>

      {/* ---------- SIDEBAR ---------- */}
      <div style={{ width: 250, borderRight: '1px solid #EAE6F6', display: 'flex', flexDirection: 'column', padding: '22px 18px', flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ width: 26, height: 26, borderRadius: 9, background: 'linear-gradient(135deg,#7A5AF8,#9B7CFF)' }} />
          <b style={{ fontSize: 17, color: '#1C1830' }}>Tiding Space</b>
        </div>
        <p style={{ fontSize: 12, color: '#A39EBD', margin: '4px 0 20px 0' }}>Real people. Real activities.<br />Right around you.</p>

        <SidebarLink icon="🧭" label="Explore" active href="/desktop" />
        <SidebarLink icon="♡" label="Saved" href="/saved" />
        <SidebarLink icon="📋" label="My Activities" href="/profile" />
        <SidebarLink icon="💬" label="Chats" href="/inbox" badge={unreadChats || undefined} />
        <SidebarLink icon="👤" label="Profile" href="/profile" />

        <div style={{ marginTop: 24, background: '#F1ECFB', borderRadius: 14, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <b style={{ fontSize: 13 }}>Your upcoming</b>
            <a href="/profile" style={{ fontSize: 11.5, color: '#7A5AF8', textDecoration: 'none', fontWeight: 600 }}>See all</a>
          </div>
          {upcoming.length === 0 && <p style={{ fontSize: 12, color: '#A39EBD' }}>Nothing yet — explore the map.</p>}
          {upcoming.map((a) => (
            <div key={a.id} onClick={() => handleSelectActivity(a.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: `${CATEGORY_COLORS[a.category]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                {CATEGORY_ICONS[a.category] ?? '📍'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                <div style={{ fontSize: 10.5, color: '#A39EBD' }}>{new Date(a.starts_at).toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            </div>
          ))}
        </div>

        {/* PLACEHOLDER: no referral/credits system exists in the schema.
            Invite button is a stub, matching this app's existing convention
            for not-yet-built features. */}
        <div style={{ marginTop: 16, background: 'linear-gradient(135deg,#7A5AF8,#6944E8)', borderRadius: 14, padding: 14, color: '#fff' }}>
          <b style={{ fontSize: 13, display: 'block' }}>Invite friends</b>
          <span style={{ fontSize: 11.5, opacity: 0.85 }}>Get free credits</span>
          <button
            onClick={() => alert('Referral program — not built yet. This is a placeholder matching the design mockup.')}
            style={{ display: 'block', marginTop: 10, background: '#fff', color: '#4B2E9E', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Invite
          </button>
        </div>
      </div>

      {/* ---------- MAIN CONTENT ---------- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderBottom: '1px solid #EAE6F6', flexShrink: 0 }}>
          <div style={{ position: 'relative', flexShrink: 0, width: 260 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A39EBD' }}>🔍</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What do you feel like doing?"
              style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid #E4DDF7', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto' }}>
            {['All', ...Object.keys(CATEGORY_GROUPS)].map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                style={{
                  padding: '7px 14px', borderRadius: 100, border: 'none', whiteSpace: 'nowrap',
                  background: activeGroup === g ? '#EDE7FC' : 'transparent',
                  color: activeGroup === g ? '#4B2E9E' : '#716C87',
                  fontWeight: activeGroup === g ? 700 : 500, fontSize: 12.5, cursor: 'pointer'
                }}
              >
                {g}
              </button>
            ))}
            <button onClick={() => alert('More categories — placeholder, same 10 real categories exist under the hood.')} style={{ padding: '7px 10px', border: 'none', background: 'none', color: '#716C87', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ⋯ More
            </button>
          </div>

          {/* PLACEHOLDER: no weather API integrated. Time shown is real; temperature is a static stub. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#716C87', flexShrink: 0, border: '1px solid #E4DDF7', borderRadius: 10, padding: '6px 10px' }}>
            <span>☀️</span>
            <span>21°C</span>
            <span style={{ color: '#D9D3F5' }}>|</span>
            <span>{new Date().toLocaleDateString(undefined, { weekday: 'short' })} {new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
          </div>

          {/* PLACEHOLDER: no notifications table/system in the backend yet — static badge */}
          <button onClick={() => alert('Notifications — not built yet. This is a placeholder matching the design mockup.')} style={{ position: 'relative', width: 34, height: 34, borderRadius: 10, border: '1px solid #E4DDF7', background: '#fff', cursor: 'pointer', flexShrink: 0 }}>
            🔔
            <span style={{ position: 'absolute', top: -4, right: -4, background: '#D14343', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 5px' }}>3</span>
          </button>

          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setProfileMenuOpen(!profileMenuOpen)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#7A5AF8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>
                {user?.email?.[0]?.toUpperCase() ?? '?'}
              </div>
              <span style={{ fontSize: 12 }}>▾</span>
            </button>
            {profileMenuOpen && (
              <div style={{ position: 'absolute', top: 42, right: 0, background: '#fff', border: '1px solid #EAE6F6', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 10, minWidth: 150 }}>
                <a href="/profile" style={menuItemStyle}>Profile</a>
                <a href="/saved" style={menuItemStyle}>Saved</a>
                <button onClick={handleLogout} style={{ ...menuItemStyle, color: '#D14343', width: '100%', textAlign: 'left', border: 'none', background: 'none' }}>Log out</button>
              </div>
            )}
          </div>
        </div>

        {/* Map + right panel */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <DesktopActivityMap activities={filteredActivities} onSelectActivity={handleSelectActivity} />
          </div>

          {selected && (
            <div style={{ width: 340, borderLeft: '1px solid #EAE6F6', overflowY: 'auto', flexShrink: 0 }}>
              {/* PLACEHOLDER: no real photo upload yet — category-tinted block instead of a real image */}
              <div style={{ height: 180, position: 'relative', background: `${CATEGORY_COLORS[selected.category]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                {CATEGORY_ICONS[selected.category] ?? '📍'}
                <button onClick={() => setSelected(null)} style={{ position: 'absolute', top: 10, left: 10, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: 15 }}>‹</button>
                <button onClick={handleToggleSave} style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: 'none', cursor: 'pointer', fontSize: 15, color: isSaved ? '#E0568C' : '#716C87' }}>{isSaved ? '♥' : '♡'}</button>
              </div>

              <div style={{ padding: 18 }}>
                <h2 style={{ fontSize: 18, margin: '0 0 4px 0' }}>{selected.title}</h2>
                <a href={`/profile/${selected.profiles?.id}`} style={{ fontSize: 12.5, color: '#716C87', textDecoration: 'none' }}>
                  by {selected.profiles?.name}
                </a>

                {user?.id === selected.profiles?.id && (
                  <a href={`/activities/${selected.id}/manage`} style={{ display: 'block', fontSize: 12, color: '#7A5AF8', fontWeight: 600, marginTop: 8, textDecoration: 'none' }}>
                    Manage attendees →
                  </a>
                )}

                <div style={{ margin: '14px 0', fontSize: 13, color: '#1C1830' }}>
                  <div style={{ marginBottom: 6 }}>📅 {new Date(selected.starts_at).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</div>
                  <div style={{ color: '#716C87' }}>📍 Exact address shown after joining</div>
                </div>

                <p style={{ fontSize: 13.5, color: '#333', lineHeight: 1.5 }}>{selected.description}</p>

                <div style={{ fontSize: 12.5, color: '#716C87', margin: '10px 0 14px 0' }}>{selected.spots_remaining} spots remaining</div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: '#716C87', marginBottom: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>I accept the <a href="/legal/terms" target="_blank" style={{ color: '#7A5AF8' }}>Terms of Service</a> and liability waiver.</span>
                </label>

                {selected.price_cents > 0 && (
                  <p style={{ fontSize: 12, color: '#716C87', marginBottom: 8 }}>
                    💵 Pay ${(selected.price_cents / 100).toFixed(2)} directly to the organizer — Tiding Space doesn't collect payment.
                  </p>
                )}
                <button
                  onClick={handleJoin}
                  disabled={joining || !agreedToTerms}
                  style={{
                    width: '100%', padding: 12, borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14,
                    background: agreedToTerms ? '#7A5AF8' : '#D9D3F5', color: '#fff',
                    cursor: agreedToTerms ? 'pointer' : 'not-allowed'
                  }}
                >
                  {joining ? 'Joining…' : 'Join Activity'}
                </button>
                {joinMessage && <p style={{ marginTop: 8, fontSize: 12.5, color: '#1FA971' }}>{joinMessage}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Explore nearby carousel */}
        <div style={{ borderTop: '1px solid #EAE6F6', padding: '16px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <b style={{ fontSize: 15 }}>Explore nearby</b>
            <a href="/create" style={{ fontSize: 12.5, color: '#7A5AF8', textDecoration: 'none', fontWeight: 600 }}>See all</a>
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
            {nearby.map((a) => (
              <div key={a.id} onClick={() => handleSelectActivity(a.id)} style={{ width: 160, flexShrink: 0, cursor: 'pointer' }}>
                {/* PLACEHOLDER: category-tinted block instead of a real photo */}
                <div style={{ height: 90, borderRadius: 12, background: `${CATEGORY_COLORS[a.category]}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 6, position: 'relative' }}>
                  {CATEGORY_ICONS[a.category] ?? '📍'}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                <div style={{ fontSize: 11, color: '#A39EBD' }}>{new Date(a.starts_at).toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer feature strip — static marketing content, no backend needed */}
        <div style={{ display: 'flex', gap: 24, padding: '14px 24px', borderTop: '1px solid #EAE6F6', flexShrink: 0, overflowX: 'auto' }}>
          <FooterItem icon="🌐" title="The city is alive" sub="Live map of real activities and people" />
          <FooterItem icon="👥" title="For everyone" sub="From locals to travelers, there's something for you" />
          <FooterItem icon="⚡" title="Easy to join" sub="One tap to join. No hassle." />
          <FooterItem icon="⭐" title="Build your world" sub="Save, review and share your experiences" />
          <FooterItem icon="❤️" title="Support local" sub="Help local businesses and communities thrive" />
        </div>
      </div>
    </div>
  );
}

function SidebarLink({ icon, label, href, active, badge }: { icon: string; label: string; href: string; active?: boolean; badge?: number }) {
  return (
    <a href={href} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10,
      textDecoration: 'none', color: active ? '#4B2E9E' : '#333', background: active ? '#EDE7FC' : 'transparent',
      fontWeight: active ? 700 : 500, fontSize: 13.5, marginBottom: 2
    }}>
      <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge ? <span style={{ background: '#7A5AF8', color: '#fff', fontSize: 10.5, fontWeight: 700, borderRadius: 8, padding: '1px 6px' }}>{badge}</span> : null}
    </a>
  );
}

function FooterItem({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 200, flexShrink: 0 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1830' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#A39EBD' }}>{sub}</div>
      </div>
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', padding: '10px 14px', fontSize: 13, color: '#1C1830', textDecoration: 'none', cursor: 'pointer'
};
