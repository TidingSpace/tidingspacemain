import { describe, it, expect, vi, beforeEach } from 'vitest';

const membershipMaybeSingleMock = vi.fn();
const upsertMock = vi.fn();

function buildMockSupabase(callerId: string) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: callerId } } }) },
    from: vi.fn((table: string) => {
      if (table === 'group_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({ maybeSingle: membershipMaybeSingleMock })
              })
            })
          }),
          upsert: (payload: any) => {
            upsertMock(payload);
            return Promise.resolve({ error: null });
          }
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from '@/lib/supabase-server';
import { createNotification } from '@/lib/notifications';
import { POST } from './route';

describe('POST /api/groups/[id]/members — invite someone', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    (createNotification as any).mockClear();
  });

  it('rejects a non-admin trying to invite someone', async () => {
    membershipMaybeSingleMock.mockResolvedValue({ data: { role: 'member' } }); // active member, but not an admin
    (createClient as any).mockReturnValue(buildMockSupabase('regular-member'));

    const request = new Request('http://localhost/api/groups/group-1/members', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'invitee-1' })
    });
    const response = await POST(request, { params: { id: 'group-1' } });

    expect(response.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('rejects someone who is not even a member of the group at all', async () => {
    membershipMaybeSingleMock.mockResolvedValue({ data: null }); // no row at all — not a member
    (createClient as any).mockReturnValue(buildMockSupabase('outsider'));

    const request = new Request('http://localhost/api/groups/group-1/members', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'invitee-1' })
    });
    const response = await POST(request, { params: { id: 'group-1' } });

    expect(response.status).toBe(403);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('lets an admin invite someone, as a pending (not instant) membership', async () => {
    membershipMaybeSingleMock.mockResolvedValue({ data: { role: 'admin' } });
    (createClient as any).mockReturnValue(buildMockSupabase('admin-1'));

    const request = new Request('http://localhost/api/groups/group-1/members', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'invitee-1' })
    });
    const response = await POST(request, { params: { id: 'group-1' } });

    expect(response.status).toBe(200);
    // The whole point of the invite flow: this must NOT be 'active' —
    // instant membership would skip the accept/decline step entirely.
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'invitee-1', status: 'pending' }));
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recipientId: 'invitee-1', type: 'group_invite' })
    );
  });

  it('requires a user_id to invite', async () => {
    membershipMaybeSingleMock.mockResolvedValue({ data: { role: 'admin' } });
    (createClient as any).mockReturnValue(buildMockSupabase('admin-1'));

    const request = new Request('http://localhost/api/groups/group-1/members', { method: 'POST', body: JSON.stringify({}) });
    const response = await POST(request, { params: { id: 'group-1' } });

    expect(response.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
