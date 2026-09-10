import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-logic tests against a mocked Supabase client (no real database in
// this environment — see the Cancel Activity test for the fuller
// explanation of what this style of test does and doesn't cover). Focused
// on the actual decisions this route makes: confirmed vs. waitlisted by
// capacity, the specific error statuses for each failure mode, and that a
// blocked RLS rejection surfaces as a clean message rather than a raw
// Postgres error.

const upsertMock = vi.fn();
const rsvpSingleMock = vi.fn();
const activitySingleMock = vi.fn();
const countMock = vi.fn();
const deleteEqMocks: any[] = [];

function buildMockSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'attendee-1' } } })
    },
    from: vi.fn((table: string) => {
      if (table === 'activities') {
        return { select: () => ({ eq: () => ({ single: activitySingleMock }) }) };
      }
      if (table === 'rsvps') {
        return {
          // GET the confirmed count — .select(..., {count, head}) then chained .eq().eq()
          select: (_cols: string, opts?: any) => {
            if (opts?.count) {
              return { eq: () => ({ eq: countMock }) };
            }
            return undefined;
          },
          upsert: (payload: any) => {
            upsertMock(payload);
            return { select: () => ({ single: rsvpSingleMock }) };
          },
          update: (payload: any) => {
            const eqChain = { eq: (...args: any[]) => { deleteEqMocks.push(args); return eqChain; } };
            return eqChain;
          }
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  notifyFollowers: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));

import { createClient } from '@/lib/supabase-server';
import { POST, DELETE } from './route';

describe('POST /api/rsvp', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    rsvpSingleMock.mockReset().mockResolvedValue({ data: { id: 'rsvp-1', status: 'confirmed' }, error: null });
    activitySingleMock.mockReset().mockResolvedValue({
      data: { capacity: 10, organizer_id: 'organizer-1', starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), ends_at: null },
      error: null
    });
    countMock.mockReset().mockResolvedValue({ count: 0 });
    (createClient as any).mockReturnValue(buildMockSupabase());
  });

  it('confirms the RSVP when under capacity', async () => {
    countMock.mockResolvedValue({ count: 3 }); // 3 confirmed out of 10 capacity
    const request = new Request('http://localhost/api/rsvp', { method: 'POST', body: JSON.stringify({ activity_id: 'activity-1' }) });
    await POST(request);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'confirmed' }));
  });

  it('waitlists the RSVP once capacity is reached', async () => {
    countMock.mockResolvedValue({ count: 10 }); // exactly at the 10-capacity limit
    const request = new Request('http://localhost/api/rsvp', { method: 'POST', body: JSON.stringify({ activity_id: 'activity-1' }) });
    await POST(request);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'waitlisted' }));
  });

  it('still waitlists when already over capacity, not just exactly at it', async () => {
    countMock.mockResolvedValue({ count: 15 }); // over-capacity edge case (e.g. capacity lowered after people already joined)
    const request = new Request('http://localhost/api/rsvp', { method: 'POST', body: JSON.stringify({ activity_id: 'activity-1' }) });
    await POST(request);
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'waitlisted' }));
  });

  it('rejects joining an activity that has already ended', async () => {
    activitySingleMock.mockResolvedValue({
      data: { capacity: 10, organizer_id: 'organizer-1', starts_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), ends_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
      error: null
    });
    const request = new Request('http://localhost/api/rsvp', { method: 'POST', body: JSON.stringify({ activity_id: 'activity-1' }) });
    const response = await POST(request);
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toBe('This activity has already ended.');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('requires activity_id', async () => {
    const request = new Request('http://localhost/api/rsvp', { method: 'POST', body: JSON.stringify({}) });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent activity', async () => {
    activitySingleMock.mockResolvedValue({ data: null, error: { message: 'not found' } });
    const request = new Request('http://localhost/api/rsvp', { method: 'POST', body: JSON.stringify({ activity_id: 'ghost' }) });
    const response = await POST(request);
    expect(response.status).toBe(404);
  });

  it('surfaces a blocked-RLS rejection as a clean, specific message, not a raw database error', async () => {
    rsvpSingleMock.mockResolvedValue({ data: null, error: { message: 'new row violates row-level security policy' } });
    const request = new Request('http://localhost/api/rsvp', { method: 'POST', body: JSON.stringify({ activity_id: 'activity-1' }) });
    const response = await POST(request);
    const json = await response.json();
    expect(response.status).toBe(403);
    expect(json.error).toBe("You can't join this activity.");
  });
});

describe('DELETE /api/rsvp', () => {
  beforeEach(() => {
    deleteEqMocks.length = 0;
    (createClient as any).mockReturnValue(buildMockSupabase());
  });

  it('requires activity_id as a query param', async () => {
    const request = new Request('http://localhost/api/rsvp', { method: 'DELETE' });
    const response = await DELETE(request);
    expect(response.status).toBe(400);
  });

  it('cancels only the caller\'s own RSVP for that specific activity', async () => {
    const request = new Request('http://localhost/api/rsvp?activity_id=activity-1', { method: 'DELETE' });
    await DELETE(request);
    // Both eq() calls (activity_id and user_id) should have actually happened —
    // this is what keeps the delete scoped to exactly one row, not every
    // RSVP the user has anywhere.
    const allArgs = deleteEqMocks.flat();
    expect(allArgs).toContain('activity-1');
    expect(allArgs).toContain('attendee-1');
  });
});
