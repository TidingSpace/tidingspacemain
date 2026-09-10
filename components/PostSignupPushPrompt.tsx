'use client';

import { useEffect, useState } from 'react';
import { COLORS, RADIUS } from '@/lib/designTokens';
import { usePushNotifications } from '@/lib/usePushNotifications';

// Shown once, only right after a fresh signup (checked via the
// ts_just_signed_up flag set in the signup handler) — not something that
// pops up for returning users, and not shown at all on browsers that
// don't support push in the first place.
export default function PostSignupPushPrompt() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const { supported, enable } = usePushNotifications();

  useEffect(() => {
    const justSignedUp = window.localStorage.getItem('ts_just_signed_up');
    if (justSignedUp) {
      window.localStorage.removeItem('ts_just_signed_up'); // one-time — removed immediately so it can never show again on a later visit
      setVisible(true);
    }
  }, []);

  if (!visible || !supported) return null;

  async function handleAllow() {
    setRequesting(true);
    await enable();
    setRequesting(false);
    setVisible(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(20,10,40,0.4)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
    }}>
      <div style={{
        background: '#fff', borderRadius: '24px 24px 0 0', padding: '28px 24px', width: '100%', maxWidth: 480,
        boxSizing: 'border-box', textAlign: 'center'
      }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: COLORS.violetTint, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={COLORS.violet} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.ink, margin: '0 0 8px 0' }}>Turn on notifications?</h2>
        <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '0 0 24px 0', lineHeight: 1.5 }}>
          Get notified about new messages so you never miss one — from DMs, groups, or activity chats.
        </p>
        <button
          onClick={handleAllow}
          disabled={requesting}
          style={{ width: '100%', padding: 14, borderRadius: RADIUS.pill, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}
        >
          {requesting ? 'Setting up…' : 'Turn On Notifications'}
        </button>
        <button
          onClick={() => setVisible(false)}
          style={{ width: '100%', padding: 14, borderRadius: RADIUS.pill, border: 'none', background: 'none', color: COLORS.textSecondary, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
