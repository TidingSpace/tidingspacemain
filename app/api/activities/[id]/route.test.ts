import { describe, it, expect, vi, beforeEach } from 'vitest';

// This test exists specifically because of a real bug: the PATCH route's
// field allowlist was rewritten for security and accidentally excluded
// `status`, silently breaking Cancel Activity (which works by sending
// { status: 'cancelled' } through this exact route) — while tsc and the
// build both stayed green. A test asserting the actual database call would
// have failed immediately when that regression was introduced, instead of
// shipping and surfacing later as "please try again" with no clear cause.
//
// No real database is available in this environment, so this mocks the
// Supabase client and asserts on what the ROUTE ITSELF does with it —
// specifically, that a { status: 'cancelled' } request actually reaches
// .update() with status: 'cancelled' in the payload. This is a route-logic
// test, not a full integration test against real RLS/data; it catches
// exactly the class of bug that happened (an allowlist silently dropping a
// field a real caller depends on), which is what matters most here.

const updateMock = vi.fn();
const singleMock = vi.fn();
const rsvpSelectMock = vi.fn();

function buildMockSupabase(userId: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } })
    },
    from: vi.fn((table: string) => {
      if (table === 'activities') {
        return {
          update: (payload: Record<string, unknown>) => {
            updateMock(payload);
            return {
              eq: () => ({
                select: () => ({
                  single: singleMock
                })
              })
            };
          }
        };
      }
      if (table === 'rsvps') {
        return {
          select: () => ({
            eq: () => ({
              in: rsvpSelectMock
            })
          })
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn()
}));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined)
}));

import { createClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { PATCH } from './route';

describe('PATCH /api/activities/[id] — Cancel Activity', () => {
  beforeEach(() => {
    updateMock.mockClear();
    singleMock.mockReset().mockResolvedValue({ data: { id: 'activity-1', status: 'cancelled' }, error: null });
    rsvpSelectMock.mockReset().mockResolvedValue({ data: [{ user_id: 'attendee-1' }, { user_id: 'attendee-2' }] });
    (createNotification as any).mockClear();
  });

  it('actually includes status: cancelled in the update payload sent to the database', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('organizer-1'));

    const request = new Request('http://localhost/api/activities/activity-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' })
    });
    const response = await PATCH(request, { params: { id: 'activity-1' } });

    expect(response.status).toBe(200);
    // The actual regression: this field silently vanished from the
    // allowlist, so this specific assertion is the one that matters most.
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
  });

  it('notifies every attendee (confirmed, waitlisted, checked in) when cancelled', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('organizer-1'));

    const request = new Request('http://localhost/api/activities/activity-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' })
    });
    await PATCH(request, { params: { id: 'activity-1' } });

    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientId: 'attendee-1', type: 'activity_cancelled' })
    );
  });

  it('rejects an arbitrary status value instead of silently accepting it', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('organizer-1'));

    const request = new Request('http://localhost/api/activities/activity-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deleted_forever' }) // not a real, allowed transition
    });
    const response = await PATCH(request, { params: { id: 'activity-1' } });
    const json = await response.json();

    // Should be rejected as "nothing recognized to update" — not silently
    // let through, and not silently ignored with a false-success response.
    expect(response.status).toBe(400);
    expect(json.error).toBeTruthy();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase(null));

    const request = new Request('http://localhost/api/activities/activity-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' })
    });
    const response = await PATCH(request, { params: { id: 'activity-1' } });

    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
