'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { COLORS, RADIUS, FONT } from '@/lib/designTokens';
import ErrorState from '@/components/ErrorState';
import Avatar from '@/components/Avatar';
import PageHeader from '@/components/PageHeader';
import LoadingState from '@/components/LoadingState';
import { useTimeFormat } from '@/lib/timeFormat';
import { usePushNotifications } from '@/lib/usePushNotifications';

type Profile = { id: string; name: string; handle: string; avatar_color: string; avatar_url?: string | null; activity_reminders_enabled: boolean; email_notifications_enabled: boolean; is_admin?: boolean };

export default function SettingsPage() {
  const supabase = createClient();
  const { use24h, setUse24h } = useTimeFormat();
  const { supported: pushSupported, enabled: pushEnabled, loading: pushLoading, enable: enablePush, disable: disablePush } = usePushNotifications();
  const [pushToggling, setPushToggling] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const loadProfile = useCallback((userId: string) => {
    setLoading(true);
    setError(false);
    fetch(`/api/profiles/${userId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.profile) setProfile(json.profile);
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
      loadProfile(data.user.id);
    });
  }, [supabase, loadProfile]);

  async function updatePreference(key: 'activity_reminders_enabled' | 'email_notifications_enabled', value: boolean) {
    if (!profile) return;
    setProfile({ ...profile, [key]: value }); // optimistic
    const res = await fetch(`/api/profiles/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
    if (!res.ok) setProfile({ ...profile, [key]: !value }); // revert on failure
  }

  async function handleLogOut() {
    if (!confirm('Log out of Tiding Space?')) return;
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    const res = await fetch('/api/account', { method: 'DELETE' });
    const json = await res.json();
    if (json.error) {
      setDeleting(false);
      setDeleteError(json.error);
      return;
    }
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (error) return <ErrorState message="Couldn't load your settings." onRetry={() => supabase.auth.getUser().then(({ data }) => data.user && loadProfile(data.user.id))} />;
  if (loading || !profile) return <LoadingState />;


  return (
    <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 60, background: '#F7F6FB', minHeight: '100vh' }}>
      <PageHeader title="Settings" backHref={`/profile/${profile.id}`} />

      {/* Profile card */}
      <Link href={`/profile/${profile.id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', margin: '0 20px 20px 20px', padding: 16, borderRadius: RADIUS.lg, textDecoration: 'none' }}>
        <Avatar name={profile.name} color={profile.avatar_color} avatarUrl={profile.avatar_url} size="lg" />
        <div style={{ flex: 1 }}>
          <div style={{ ...FONT.cardTitle, color: COLORS.ink }}>{profile.name}</div>
          <div style={{ fontSize: 12.5, color: COLORS.textFaint }}>@{profile.handle}</div>
          <div style={{ fontSize: 12.5, color: COLORS.violet, fontWeight: 700, marginTop: 2 }}>View Profile</div>
        </div>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </Link>

      <SectionLabel>Account</SectionLabel>
      <Section>
        <LinkRow href={`/profile/${profile.id}`} icon={personIcon} title="Edit Profile" subtitle="Update your photo, bio and personal info" />
        <StubRow icon={shieldIcon} title="Account & Security" subtitle="Password, login activity, two-factor auth" />
        <StubRow icon={lockIcon} title="Privacy" subtitle="Control who can see your content and activity" />
        <LinkRow href="/settings/blocked" icon={noEntryIcon} title="Blocked Accounts" subtitle="Manage accounts you've blocked" />
      </Section>

      <SectionLabel>Notifications</SectionLabel>
      <Section>
        <StubRow icon={bellIcon} title="Notification Preferences" subtitle="Choose what you want to be notified about" />
        <ToggleRow icon={calendarIcon} title="Activity Reminders" subtitle="Get reminders for activities and events" checked={profile.activity_reminders_enabled} onChange={(v) => updatePreference('activity_reminders_enabled', v)} />
        <ToggleRow icon={clockIcon} title="24-Hour Time" subtitle={use24h ? 'Showing times like 14:00' : 'Showing times like 2 PM'} checked={use24h} onChange={setUse24h} />
        <StubRow icon={chatIcon} title="In-App Notifications" subtitle="Likes, comments, messages and more" />
        {pushSupported && (
          <ToggleRow
            icon={bellIcon}
            title="Push Notifications"
            subtitle={pushEnabled ? 'Get notified about new messages' : 'Currently off for this device'}
            checked={pushEnabled}
            disabled={pushLoading || pushToggling}
            onChange={async (v) => {
              setPushToggling(true);
              const success = v ? await enablePush() : await (disablePush().then(() => true));
              setPushToggling(false);
              if (v && !success) alert("Couldn't enable push notifications — check your browser's notification permission for this site.");
            }}
          />
        )}
        {pushSupported && pushEnabled && (
          <div style={{ padding: '10px 16px 14px 16px', borderBottom: `1px solid ${COLORS.borderLight}` }}>
            <button
              onClick={async () => {
                setTestingPush(true);
                setTestResult(null);
                try {
                  const res = await fetch('/api/push/test', { method: 'POST' });
                  const json = await res.json();
                  setTestResult(json);
                } catch {
                  setTestResult({ vapidConfigured: false, subscriptionCount: 0, results: [], fetchFailed: true });
                }
                setTestingPush(false);
              }}
              disabled={testingPush}
              style={{ fontSize: 13, fontWeight: 600, color: COLORS.violet, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {testingPush ? 'Sending…' : 'Send Test Notification'}
            </button>
            {testResult && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.6, fontFamily: 'monospace', background: COLORS.surfaceAlt, borderRadius: RADIUS.sm, padding: 10 }}>
                {testResult.fetchFailed && 'Request failed — check your connection.'}
                {!testResult.fetchFailed && !testResult.vapidConfigured && 'VAPID keys are not configured on the server. Push cannot work at all until NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set in your deployment environment variables.'}
                {!testResult.fetchFailed && testResult.vapidConfigured && testResult.subscriptionCount === 0 && 'VAPID keys are configured, but no subscription was found for your account on the server — try turning the toggle off and back on.'}
                {!testResult.fetchFailed && testResult.vapidConfigured && testResult.subscriptionCount > 0 && (
                  <>
                    Found {testResult.subscriptionCount} subscription(s):
                    {testResult.results.map((r: any, i: number) => (
                      <div key={i} style={{ marginTop: 4 }}>
                        {r.success ? '✅ Sent successfully' : `❌ Failed: ${r.error}`}
                      </div>
                    ))}
                    {testResult.results.some((r: any) => r.success) && ' If nothing appeared, the issue is on the delivery/display side, not the send.'}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <ToggleRow icon={envelopeIcon} title="Email Notifications" subtitle="Coming soon" checked={false} onChange={() => {}} disabled />
      </Section>

      <SectionLabel>Preferences</SectionLabel>
      <Section>
        <StubRow icon={moonIcon} title="Appearance" subtitle="Choose your theme" value="System" />
        <StubRow icon={globeIcon} title="Language" subtitle="Select your preferred language" value="English" />
        <StubRow icon={compassIcon} title="Discover Preferences" subtitle="Customize what you see in Explore and Feed" />
      </Section>

      <SectionLabel>Support &amp; Others</SectionLabel>
      <Section>
        <StubRow icon={helpIcon} title="Help Center" subtitle="FAQs and support" />
        <StubRow icon={peopleIcon} title="Invite Friends" subtitle="Invite friends and earn rewards" />
        <StubRow icon={megaphoneIcon} title="What's New" subtitle="See the latest updates and features" />
        <StubRow icon={infoIcon} title="About Tiding Space" subtitle="Version 1.0.0" />
      </Section>

      {profile.is_admin && (
        <a
          href="/admin/reports"
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 40px)', margin: '20px 20px 0 20px',
            background: '#fff', border: 'none', borderRadius: RADIUS.lg, padding: 16, textDecoration: 'none', color: COLORS.ink, fontWeight: 700, fontSize: 14.5
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          Reports (Admin)
        </a>
      )}

      <button
        onClick={handleLogOut}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 40px)', margin: '20px 20px 0 20px',
          background: '#fff', border: 'none', borderRadius: RADIUS.lg, padding: 16, cursor: 'pointer', color: '#D14343', fontWeight: 700, fontSize: 14.5
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#D14343" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        Log Out
      </button>

      <button
        onClick={() => setDeleteSheetOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 40px)', margin: '10px 20px 20px 20px',
          background: '#fff', border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: 16, cursor: 'pointer', color: COLORS.textFaint, fontWeight: 600, fontSize: 14.5
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
        Delete Account
      </button>

      {deleteSheetOpen && (
        <div onClick={() => !deleting && setDeleteSheetOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', padding: '20px 20px 32px 20px' }}
          >
            <div style={{ width: 36, height: 4, background: COLORS.border, borderRadius: 10, margin: '0 auto 16px auto' }} />
            <div style={{ ...FONT.cardTitle, color: COLORS.danger, marginBottom: 10 }}>Delete your account?</div>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.5, marginBottom: 14 }}>
              This permanently deletes your profile, posts, and comments. <b>Any activities or groups you created are deleted too</b> — including their attendee lists and chat history for everyone in them. This cannot be undone.
            </p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              style={{ width: '100%', padding: 12, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }}
            />
            {deleteError && <p style={{ color: COLORS.danger, fontSize: 13, marginBottom: 12 }}>{deleteError}</p>}
            <button
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              style={{
                width: '100%', padding: 14, borderRadius: RADIUS.md, border: 'none', fontWeight: 700, fontSize: 14.5,
                background: deleteConfirmText === 'DELETE' ? COLORS.danger : COLORS.surfaceAlt,
                color: deleteConfirmText === 'DELETE' ? '#fff' : COLORS.textFaint,
                cursor: deleteConfirmText === 'DELETE' && !deleting ? 'pointer' : 'default'
              }}
            >
              {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
            </button>
            <button
              onClick={() => { setDeleteSheetOpen(false); setDeleteConfirmText(''); setDeleteError(null); }}
              disabled={deleting}
              style={{ width: '100%', padding: 12, background: 'none', border: 'none', color: COLORS.textSecondary, fontWeight: 600, fontSize: 14, marginTop: 8, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 24px 8px 24px' }}>{children}</div>;
}
function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', margin: '0 20px 20px 20px', borderRadius: RADIUS.lg, overflow: 'hidden' }}>{children}</div>;
}
function RowShell({ icon, title, subtitle, value, right }: { icon: React.ReactNode; title: string; subtitle: string; value?: string; right: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: COLORS.ink }}>{title}</div>
        <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 1 }}>{subtitle}</div>
      </div>
      {value && <span style={{ fontSize: 13, color: COLORS.textFaint, flexShrink: 0 }}>{value}</span>}
      {right}
    </div>
  );
}
function chevron() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={COLORS.textFaint} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
}
function LinkRow({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <a href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <RowShell icon={icon} title={title} subtitle={subtitle} right={chevron()} />
    </a>
  );
}
function StubRow({ icon, title, subtitle, value }: { icon: React.ReactNode; title: string; subtitle: string; value?: string }) {
  return (
    <div onClick={() => alert(`${title} — coming soon.`)} style={{ cursor: 'pointer' }}>
      <RowShell icon={icon} title={title} subtitle={subtitle} value={value} right={chevron()} />
    </div>
  );
}
function ToggleRow({ icon, title, subtitle, checked, onChange, disabled }: { icon: React.ReactNode; title: string; subtitle: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <RowShell
      icon={icon} title={title} subtitle={subtitle}
      right={
        <button
          onClick={() => !disabled && onChange(!checked)}
          disabled={disabled}
          style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer', position: 'relative', background: disabled ? COLORS.surfaceAlt : (checked ? COLORS.violet : COLORS.border), flexShrink: 0, opacity: disabled ? 0.6 : 1 }}
        >
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: disabled ? COLORS.border : '#fff', position: 'absolute', top: 3, left: checked ? 21 : 3, transition: 'left .15s ease' }} />
        </button>
      }
    />
  );
}

const iconProps = { width: 17, height: 17, fill: 'none', stroke: COLORS.violet, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const personIcon = <svg viewBox="0 0 24 24" {...iconProps}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
const shieldIcon = <svg viewBox="0 0 24 24" {...iconProps}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const lockIcon = <svg viewBox="0 0 24 24" {...iconProps}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
const noEntryIcon = <svg viewBox="0 0 24 24" {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" /></svg>;
const bellIcon = <svg viewBox="0 0 24 24" {...iconProps}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
const calendarIcon = <svg viewBox="0 0 24 24" {...iconProps}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const clockIcon = <svg viewBox="0 0 24 24" {...iconProps}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
const chatIcon = <svg viewBox="0 0 24 24" {...iconProps}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>;
const envelopeIcon = <svg viewBox="0 0 24 24" {...iconProps}><rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2 7 12 13 22 7" /></svg>;
const moonIcon = <svg viewBox="0 0 24 24" {...iconProps}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
const globeIcon = <svg viewBox="0 0 24 24" {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
const compassIcon = <svg viewBox="0 0 24 24" {...iconProps}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>;
const helpIcon = <svg viewBox="0 0 24 24" {...iconProps}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
const peopleIcon = <svg viewBox="0 0 24 24" {...iconProps}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
const megaphoneIcon = <svg viewBox="0 0 24 24" {...iconProps}><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>;
const infoIcon = <svg viewBox="0 0 24 24" {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
