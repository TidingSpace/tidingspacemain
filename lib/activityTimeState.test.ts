import { describe, it, expect } from 'vitest';
import { getActivityTimeState, getEffectiveEndTime, formatCountdown, DEFAULT_ACTIVITY_DURATION_MS } from '@/lib/activityTimeState';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

describe('getEffectiveEndTime', () => {
  it('uses the explicit end time when one is set', () => {
    const starts = '2026-01-01T10:00:00.000Z';
    const ends = '2026-01-01T12:00:00.000Z';
    expect(getEffectiveEndTime(starts, ends).toISOString()).toBe(ends);
  });

  it('falls back to start + default duration when no end time is set', () => {
    const starts = '2026-01-01T10:00:00.000Z';
    const expected = new Date(new Date(starts).getTime() + DEFAULT_ACTIVITY_DURATION_MS).toISOString();
    expect(getEffectiveEndTime(starts, null).toISOString()).toBe(expected);
  });
});

describe('getActivityTimeState', () => {
  const starts = '2026-06-15T18:00:00.000Z';

  it('is "upcoming" more than 24h before start', () => {
    const now = new Date(new Date(starts).getTime() - 25 * HOUR);
    expect(getActivityTimeState(starts, null, now)).toBe('upcoming');
  });

  it('is "soon" between 24h and 2h before start', () => {
    const now = new Date(new Date(starts).getTime() - 5 * HOUR);
    expect(getActivityTimeState(starts, null, now)).toBe('soon');
  });

  it('is "starting_soon" between 2h and 30min before start', () => {
    const now = new Date(new Date(starts).getTime() - 90 * MIN);
    expect(getActivityTimeState(starts, null, now)).toBe('starting_soon');
  });

  it('is "starting_very_soon" between 30min and 10min before start', () => {
    const now = new Date(new Date(starts).getTime() - 20 * MIN);
    expect(getActivityTimeState(starts, null, now)).toBe('starting_very_soon');
  });

  it('is "starting_now" within 10min of start', () => {
    const now = new Date(new Date(starts).getTime() - 5 * MIN);
    expect(getActivityTimeState(starts, null, now)).toBe('starting_now');
  });

  it('is "in_progress" right after start with no end time set', () => {
    const now = new Date(new Date(starts).getTime() + 10 * MIN);
    expect(getActivityTimeState(starts, null, now)).toBe('in_progress');
  });

  it('is "finished" once the effective end time (start + 2h default) has passed, even with no explicit end time', () => {
    // This is the exact bug this whole system was built to fix: an activity
    // with no end time set must NOT stay LIVE forever.
    const now = new Date(new Date(starts).getTime() + DEFAULT_ACTIVITY_DURATION_MS + 1 * MIN);
    expect(getActivityTimeState(starts, null, now)).toBe('finished');
  });

  it('respects an explicit end time over the default duration', () => {
    const ends = new Date(new Date(starts).getTime() + 30 * MIN).toISOString(); // much shorter than the 2h default
    const now = new Date(new Date(starts).getTime() + 45 * MIN); // after the explicit end, well before the default's would-be end
    expect(getActivityTimeState(starts, ends, now)).toBe('finished');
  });

  it('is "ending_soon" within 30min of an explicit end time', () => {
    const ends = new Date(new Date(starts).getTime() + 2 * HOUR).toISOString();
    const now = new Date(new Date(ends).getTime() - 15 * MIN);
    expect(getActivityTimeState(starts, ends, now)).toBe('ending_soon');
  });
});

describe('formatCountdown', () => {
  it('shows whole minutes when 10 or more remain', () => {
    const target = new Date(Date.now() + 15 * MIN + 30 * 1000).toISOString();
    expect(formatCountdown(target)).toBe('15 min');
  });

  it('shows MM:SS once under 10 minutes remain', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const target = new Date(now.getTime() + 9 * MIN + 5 * 1000).toISOString();
    expect(formatCountdown(target, now)).toBe('09:05');
  });

  it('never goes negative once the target has passed', () => {
    const now = new Date('2026-01-01T00:10:00.000Z');
    const target = '2026-01-01T00:00:00.000Z';
    expect(formatCountdown(target, now)).toBe('00:00');
  });
});
