import { describe, it, expect } from 'vitest';
import { isOnline, ONLINE_THRESHOLD_MS } from '@/lib/presence';

describe('isOnline', () => {
  it('is false when last_seen_at is null (never seen)', () => {
    expect(isOnline(null)).toBe(false);
  });

  it('is true when last seen just now', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(isOnline(now.toISOString(), now)).toBe(true);
  });

  it('is true right up to the threshold', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - (ONLINE_THRESHOLD_MS - 1000));
    expect(isOnline(lastSeen.toISOString(), now)).toBe(true);
  });

  it('is false once the threshold has passed', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const lastSeen = new Date(now.getTime() - (ONLINE_THRESHOLD_MS + 1000));
    expect(isOnline(lastSeen.toISOString(), now)).toBe(false);
  });
});
