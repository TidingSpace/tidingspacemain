'use client';

import { COLORS, RADIUS, FONT } from '@/lib/designTokens';

export default function ErrorState({
  message = "Couldn't load this — check your connection and try again.",
  onRetry
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
      <p style={{ fontSize: FONT.caption.fontSize, color: COLORS.textSecondary, marginBottom: onRetry ? 16 : 0, lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 16, padding: '10px 24px', borderRadius: RADIUS.pill, border: 'none',
            background: COLORS.violet, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer'
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
