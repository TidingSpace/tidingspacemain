'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Last line of defense: catches an error in the ROOT layout itself, which is
// rare but possible. This replaces the entire page (including layout.tsx),
// so per Next.js's convention it must render its own <html>/<body> — and
// deliberately avoids importing anything else from the APP (design tokens,
// shared components), so this boundary can't itself fail for the same reason
// the thing it's catching failed. @sentry/nextjs is the one exception —
// external, defensive-by-design error-reporting code, not app logic that
// could crash for the same underlying reason. Colors are hardcoded to match
// the app's palette rather than imported.
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 24px', textAlign: 'center'
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.25, color: '#1C1830', margin: '0 0 8px 0' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#716C87', maxWidth: 320, lineHeight: 1.5, margin: '0 0 24px 0' }}>
            Tiding Space hit an unexpected error. This has been logged — try again, and if it keeps happening, let us know.
          </p>
          <button
            onClick={reset}
            style={{ padding: '10px 24px', borderRadius: 100, border: 'none', background: '#7A5AF8', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
