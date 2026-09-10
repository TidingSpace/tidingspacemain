import { describe, it, expect } from 'vitest';
import { formatTimeWithPreference } from '@/lib/timeFormat';

describe('formatTimeWithPreference', () => {
  // Fixed to a specific UTC instant — the exact displayed string depends on
  // the runner's system timezone either way, so these assertions check
  // structural properties (contains :00, matches AM/PM, etc.) rather than
  // one exact hardcoded string, so the test stays valid regardless of which
  // timezone it happens to run in.
  const tenAm = new Date(Date.UTC(2026, 0, 15, 10, 0));
  const twoThirtyPm = new Date(Date.UTC(2026, 0, 15, 14, 30));

  it('12-hour mode omits :00 for a round hour but always keeps AM/PM', () => {
    const result = formatTimeWithPreference(tenAm, false);
    expect(result).not.toContain(':00');
    expect(result.toUpperCase()).toMatch(/AM|PM/);
  });

  it('12-hour mode shows minutes when they are not zero', () => {
    const result = formatTimeWithPreference(twoThirtyPm, false);
    expect(result).toContain(':30');
  });

  it('24-hour mode always shows HH:MM with no AM/PM', () => {
    const result = formatTimeWithPreference(tenAm, true);
    expect(result.toUpperCase()).not.toMatch(/AM|PM/);
    expect(result).toMatch(/^\d{1,2}:\d{2}$/);
  });

  it('accepts an ISO string the same way it accepts a Date', () => {
    const asDate = formatTimeWithPreference(twoThirtyPm, true);
    const asString = formatTimeWithPreference(twoThirtyPm.toISOString(), true);
    expect(asString).toBe(asDate);
  });
});
