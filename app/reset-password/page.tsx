'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { COLORS, RADIUS, FONT } from '@/lib/designTokens';

// Landed on after clicking the link in the password-reset email. Supabase's
// browser client automatically parses the recovery token out of the URL on
// load and establishes a temporary "recovery" session — that's what
// onAuthStateChange's PASSWORD_RECOVERY event below is detecting, not
// anything this page does manually. Once that session exists, updateUser()
// with a new password is a normal authenticated call; Supabase turns the
// recovery session into a regular one automatically once it succeeds.
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    // If the recovery event already fired before this listener was attached
    // (a real possibility given the timing of the redirect), fall back to
    // checking whether a session already exists.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setReady(true);
      else setInvalidLink(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Those passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div style={{ maxWidth: 380, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <div style={{ background: COLORS.successTint, padding: 16, borderRadius: RADIUS.md, fontSize: 14, color: COLORS.success, fontWeight: 600, marginBottom: 20 }}>
          Your password has been updated.
        </div>
        <Link href="/" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 10, background: COLORS.violet, color: '#fff', fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>
          Continue to Tiding Space
        </Link>
      </div>
    );
  }

  if (invalidLink) {
    return (
      <div style={{ maxWidth: 380, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 16 }}>
          This password reset link is invalid or has expired. Request a new one from the login page.
        </p>
        <Link href="/login" style={{ color: COLORS.violet, fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>← Back to log in</Link>
      </div>
    );
  }

  if (!ready) {
    return <div style={{ padding: 40, color: COLORS.textSecondary, textAlign: 'center' }}>Verifying your link…</div>;
  }

  return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: 24 }}>
      <h1 style={{ ...FONT.sectionTitle, marginBottom: 4, color: COLORS.ink }}>Set a new password</h1>
      <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>Choose a new password for your account.</p>

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          required
          minLength={6}
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: 12, borderRadius: 10, border: 'none',
            background: COLORS.violet, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14
          }}
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>
        {error && <p style={{ color: COLORS.danger, fontSize: 13, marginTop: 10 }}>{error}</p>}
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: 12, borderRadius: 10,
  border: `1px solid ${COLORS.border}`, marginBottom: 12, fontSize: 14, boxSizing: 'border-box'
};
