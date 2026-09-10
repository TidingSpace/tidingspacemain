import { describe, it, expect, vi, beforeEach } from 'vitest';

const blockUpsertMock = vi.fn();
const followDeleteOrMock = vi.fn();

function buildMockSupabase(callerId: string) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: callerId } } }) },
    from: vi.fn((table: string) => {
      if (table === 'blocks') {
        return { upsert: (payload: any) => { blockUpsertMock(payload); return Promise.resolve({ error: null }); } };
      }
      if (table === 'follows') {
        return { delete: () => ({ or: followDeleteOrMock }) };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase-server';
import { POST } from './route';

describe('POST /api/blocks/[userId]', () => {
  beforeEach(() => {
    blockUpsertMock.mockClear();
    followDeleteOrMock.mockClear().mockResolvedValue({ error: null });
  });

  it('prevents blocking yourself', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('user-1'));
    const request = new Request('http://localhost/api/blocks/user-1', { method: 'POST' });
    const response = await POST(request, { params: { userId: 'user-1' } });

    expect(response.status).toBe(400);
    expect(blockUpsertMock).not.toHaveBeenCalled();
  });

  it('creates the block record with the correct blocker/blocked direction', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('user-1'));
    const request = new Request('http://localhost/api/blocks/user-2', { method: 'POST' });
    await POST(request, { params: { userId: 'user-2' } });

    expect(blockUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ blocker_id: 'user-1', blocked_id: 'user-2' })
    );
  });

  it('removes any existing follow relationship in EITHER direction, not just one', async () => {
    (createClient as any).mockReturnValue(buildMockSupabase('user-1'));
    const request = new Request('http://localhost/api/blocks/user-2', { method: 'POST' });
    await POST(request, { params: { userId: 'user-2' } });

    expect(followDeleteOrMock).toHaveBeenCalledTimes(1);
    const filterArg = followDeleteOrMock.mock.calls[0][0] as string;
    // Must reference both people as follower in one clause and followed in
    // the other — this is what makes it bidirectional rather than only
    // cleaning up "I followed them," missing "they followed me."
    expect(filterArg).toContain('follower_id.eq.user-1');
    expect(filterArg).toContain('followed_id.eq.user-2');
    expect(filterArg).toContain('follower_id.eq.user-2');
    expect(filterArg).toContain('followed_id.eq.user-1');
  });

  it('requires authentication', async () => {
    (createClient as any).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const request = new Request('http://localhost/api/blocks/user-2', { method: 'POST' });
    const response = await POST(request, { params: { userId: 'user-2' } });

    expect(response.status).toBe(401);
    expect(blockUpsertMock).not.toHaveBeenCalled();
  });
});
