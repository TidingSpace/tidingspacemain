import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsertMock = vi.fn();
let mockExistingMembership: { status: string } | null = null; // default: not a member yet

function buildMockSupabase(callerId: string | undefined) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: callerId ? { id: callerId } : null } }) },
    from: vi.fn((table: string) => {
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: mockExistingMembership })
              })
            })
          }),
          upsert: (payload: any) => { upsertMock(payload); return Promise.resolve({ error: null }); }
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
const trackServerEventMock = vi.fn();
vi.mock('@/lib/analytics-server', () => ({ trackServerEvent: (...args: any[]) => { trackServerEventMock(...args); return Promise.resolve(); } }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn().mockResolvedValue(true) }));

import { createClient } from '@/lib/supabase-server';
import { POST } from './route';

describe('POST /api/groups/[id]/join', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    trackServerEventMock.mockClear();
    mockExistingMembership = null;
  });

  it('fires group_joined analytics for a genuinely new join', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('user-1'));
    const request = new Request('http://localhost/api/groups/group-1/join', { method: 'POST' });
    await POST(request, { params: { id: 'group-1' } });
    expect(trackServerEventMock).toHaveBeenCalledTimes(1);
    expect(trackServerEventMock).toHaveBeenCalledWith('user-1', 'group_joined', { via: 'direct' });
  });

  it('does NOT fire group_joined when the caller is already an active member (a stale UI, a replayed request, or a double-tap all reach this exact case)', async () => {
    mockExistingMembership = { status: 'active' };
    (createClient as any).mockReturnValue(buildMockSupabase('user-1'));
    const request = new Request('http://localhost/api/groups/group-1/join', { method: 'POST' });
    const response = await POST(request, { params: { id: 'group-1' } });
    expect(response.status).toBe(200); // still succeeds — there's just nothing new to report
    expect(trackServerEventMock).not.toHaveBeenCalled();
    // The upsert itself still runs either way — harmless, idempotent —
    // this test is specifically about the analytics event, not the write.
    expect(upsertMock).toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase(undefined));
    const request = new Request('http://localhost/api/groups/group-1/join', { method: 'POST' });
    const response = await POST(request, { params: { id: 'group-1' } });
    expect(response.status).toBe(401);
    expect(trackServerEventMock).not.toHaveBeenCalled();
  });
});
