import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateMock = vi.fn();
const eqArgsCollected: any[] = [];
let mockMatchedRows: { user_id: string }[] = [{ user_id: 'invitee-1' }]; // default: a row was genuinely matched/updated

function buildMockSupabase(callerId: string) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: callerId } } }) },
    from: vi.fn((table: string) => {
      if (table === 'group_members') {
        return {
          update: (payload: any) => {
            updateMock(payload);
            const chain = {
              eq: (...args: any[]) => { eqArgsCollected.push(args); return chain; },
              select: () => Promise.resolve({ data: mockMatchedRows, error: null })
            };
            return chain;
          }
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
const trackServerEventMock = vi.fn();
vi.mock('@/lib/analytics-server', () => ({ trackServerEvent: (...args: any[]) => { trackServerEventMock(...args); return Promise.resolve(); } }));

import { createClient } from '@/lib/supabase-server';
import { POST } from './route';

describe('POST /api/groups/[id]/members/respond', () => {
  beforeEach(() => {
    updateMock.mockClear();
    eqArgsCollected.length = 0;
    mockMatchedRows = [{ user_id: 'invitee-1' }];
    trackServerEventMock.mockClear();
  });

  it('fires group_joined analytics when a pending invite is genuinely accepted', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('invitee-1'));
    const request = new Request('http://localhost/api/groups/group-1/members/respond', {
      method: 'POST',
      body: JSON.stringify({ accept: true })
    });
    await POST(request, { params: { id: 'group-1' } });
    expect(trackServerEventMock).toHaveBeenCalledTimes(1);
    expect(trackServerEventMock).toHaveBeenCalledWith('invitee-1', 'group_joined', { via: 'invite' });
  });

  it('does NOT fire group_joined when the update matches zero rows (e.g. an already-resolved invite, or a duplicate/replayed request)', async () => {
    mockMatchedRows = []; // simulates the .eq('status', 'pending') filter matching nothing — a real, unremarkable outcome, not an error
    (createClient as any).mockReturnValue(buildMockSupabase('invitee-1'));
    const request = new Request('http://localhost/api/groups/group-1/members/respond', {
      method: 'POST',
      body: JSON.stringify({ accept: true })
    });
    const response = await POST(request, { params: { id: 'group-1' } });
    expect(response.status).toBe(200); // still a "successful" response — no error occurred, there's just nothing left to do
    expect(trackServerEventMock).not.toHaveBeenCalled();
  });

  it('does NOT fire group_joined on a decline, even when a row is genuinely matched', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('invitee-1'));
    const request = new Request('http://localhost/api/groups/group-1/members/respond', {
      method: 'POST',
      body: JSON.stringify({ accept: false })
    });
    await POST(request, { params: { id: 'group-1' } });
    expect(trackServerEventMock).not.toHaveBeenCalled();
  });

  it('accepting flips status to active', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('invitee-1'));
    const request = new Request('http://localhost/api/groups/group-1/members/respond', {
      method: 'POST',
      body: JSON.stringify({ accept: true })
    });
    await POST(request, { params: { id: 'group-1' } });
    expect(updateMock).toHaveBeenCalledWith({ status: 'active' });
  });

  it('declining flips status to declined, not deleting the row', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('invitee-1'));
    const request = new Request('http://localhost/api/groups/group-1/members/respond', {
      method: 'POST',
      body: JSON.stringify({ accept: false })
    });
    await POST(request, { params: { id: 'group-1' } });
    expect(updateMock).toHaveBeenCalledWith({ status: 'declined' });
  });

  it('only ever acts on the caller\'s own pending invite, scoped correctly', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('invitee-1'));
    const request = new Request('http://localhost/api/groups/group-1/members/respond', {
      method: 'POST',
      body: JSON.stringify({ accept: true })
    });
    await POST(request, { params: { id: 'group-1' } });

    const allArgs = eqArgsCollected.flat();
    expect(allArgs).toContain('group-1');
    expect(allArgs).toContain('invitee-1');
    expect(allArgs).toContain('pending'); // must only ever respond to a genuinely pending row
  });

  it('requires authentication', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase(undefined as any));
    (createClient as any).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
    });
    const request = new Request('http://localhost/api/groups/group-1/members/respond', {
      method: 'POST',
      body: JSON.stringify({ accept: true })
    });
    const response = await POST(request, { params: { id: 'group-1' } });
    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
