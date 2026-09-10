'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { COLORS, RADIUS, FONT } from '@/lib/designTokens';

// Catches any uncaught rendering/runtime error within this route segment and
// everything below it, so a single bad component can't take down the whole
// app with Next's generic, unbranded error screen. Deliberately shows only a
// generic message — never error.message or a stack trace, which could leak
// internal details (a query shape, a field name, etc.) to the person using
// the app. The full error goes to Sentry (when configured) and the browser
// console, never rendered into the page itself.
export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error boundary caught:', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '48px 24px', textAlign: 'center'
    }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ ...FONT.sectionTitle, color: COLORS.ink, margin: '0 0 8px 0' }}>Something went wrong</h1>
      <p style={{ fontSize: 14, color: COLORS.textSecondary, maxWidth: 320, lineHeight: 1.5, margin: '0 0 24px 0' }}>
        We hit an unexpected error loading this page. This has been logged — try again, and if it keeps happening, let us know.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={reset}
          style={{ padding: '10px 24px', borderRadius: RADIUS.pill, border: 'none', background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Try Again
        </button>
        <a
          href="/"
          style={{ padding: '10px 24px', borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, color: COLORS.ink, fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center' }}
        >
          Go Home
        </a>
      </div>
    </div>
  );
}
