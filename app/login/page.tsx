'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { initAnalytics, identifyUser, trackEvent } from '@/lib/analytics-client';
import { COLORS, RADIUS, FONT } from '@/lib/designTokens';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      setLoading(false);
      if (error) return setError(error.message);
      setResetEmailSent(true);
      return;
    }

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name || email.split('@')[0] },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      });
      setLoading(false);
      if (error) return setError(error.message);
      // Fires here — when signUp() itself succeeds — not when email
      // confirmation later completes. Those are genuinely different
      // moments: this app defaults to requiring email confirmation, so
      // "completed" here means the account was successfully created, not
      // that it's been verified yet. No separate email_confirmed event
      // exists in the requested schema, so this is the one well-defined
      // point reflecting "the signup action succeeded."
      if (data.user) {
        initAnalytics();
        identifyUser(data.user.id);
        trackEvent('signup_completed');
      }
      // Checked once on Explore's first load after this, to offer turning
      // on push notifications — localStorage rather than sessionStorage
      // since email confirmation (the "check your email" path below) can
      // complete in an entirely different tab/session than this one.
      window.localStorage.setItem('ts_just_signed_up', '1');
      // If email confirmation is on in your Supabase project (the default),
      // there's no session yet — they need to click the link in their inbox.
      if (data.user && !data.session) {
        setCheckEmail(true);
      } else {
        window.location.href = '/';
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError(error.message);
      window.location.href = '/';
    }
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setError(error.message);
    // On success, Supabase redirects to Google, then back to /auth/callback — no further code needed here.
  }

  if (resetEmailSent) {
    return (
      <div style={{ maxWidth: 380, margin: '80px auto', padding: 24 }}>
        <div style={{ background: COLORS.violetTint, padding: 16, borderRadius: RADIUS.md, fontSize: 14 }}>
          If an account exists for <b>{email}</b>, a password reset link is on its way — check your inbox.
        </div>
        <button
          onClick={() => { setResetEmailSent(false); setMode('signin'); }}
          style={{ background: 'none', border: 'none', color: COLORS.violet, fontWeight: 600, cursor: 'pointer', padding: 0, font: 'inherit', marginTop: 16 }}
        >
          ← Back to log in
        </button>
      </div>
    );
  }

  if (checkEmail) {
    return (
      <div style={{ maxWidth: 380, margin: '80px auto', padding: 24 }}>
        <div style={{ background: COLORS.violetTint, padding: 16, borderRadius: RADIUS.md, fontSize: 14 }}>
          Check <b>{email}</b> to confirm your account, then come back and sign in.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: 24 }}>
      <h1 style={{ ...FONT.sectionTitle, marginBottom: 4, color: COLORS.ink }}>
        {mode === 'signin' ? 'Log in to Tiding Space' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
      </h1>
      <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>
        {mode === 'forgot' ? (
          <>
            Enter your email and we'll send you a link to reset it.{' '}
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              style={{ background: 'none', border: 'none', color: COLORS.violet, fontWeight: 600, cursor: 'pointer', padding: 0, font: 'inherit' }}
            >
              Back to log in
            </button>
          </>
        ) : (
          <>
            {mode === 'signin' ? "Don't have an account yet?" : 'Already have an account?'}{' '}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
              style={{ background: 'none', border: 'none', color: COLORS.violet, fontWeight: 600, cursor: 'pointer', padding: 0, font: 'inherit' }}
            >
              {mode === 'signin' ? 'Sign up' : 'Log in'}
            </button>
          </>
        )}
      </p>

      {mode !== 'forgot' && (
        <>
          <button
            onClick={handleGoogle}
            style={{
              width: '100%', padding: 11, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
              background: '#fff', color: COLORS.ink, fontWeight: 600, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 18
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.4 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.6 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/>
              <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.1-5.1l-6.5-5.5C29.5 35.1 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.5 5.5C40.9 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 18px 0' }}>
            <div style={{ flex: 1, height: 1, background: COLORS.border }} />
            <span style={{ fontSize: 12, color: COLORS.textFaint }}>or</span>
            <div style={{ flex: 1, height: 1, background: COLORS.border }} />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        )}
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        {mode !== 'forgot' && (
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        )}
        {mode === 'signin' && (
          <button
            type="button"
            onClick={() => { setMode('forgot'); setError(null); }}
            style={{ background: 'none', border: 'none', color: COLORS.violet, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14, display: 'block' }}
          >
            Forgot password?
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: 12, borderRadius: 10, border: 'none',
            background: COLORS.violet, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14
          }}
        >
          {loading ? 'Please wait…' : mode === 'signin' ? 'Log In' : mode === 'signup' ? 'Sign Up' : 'Send Reset Link'}
        </button>
        {error && <p style={{ color: COLORS.danger, fontSize: 13, marginTop: 10 }}>{error}</p>}
      </form>

      <p style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 20, textAlign: 'center' }}>
        By continuing, you agree to our{' '}
        <a href="/legal/terms" target="_blank" style={{ color: COLORS.violet }}>Terms of Service</a> and{' '}
        <a href="/legal/privacy" target="_blank" style={{ color: COLORS.violet }}>Privacy Policy</a>.
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: 12, borderRadius: 10,
  border: `1px solid ${COLORS.border}`, marginBottom: 12, fontSize: 14, boxSizing: 'border-box'
};
