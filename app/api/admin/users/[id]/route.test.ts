import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-logic tests against a mocked Supabase client. Focused on the
// highest-risk admin action in the app — suspend/ban — since it has real
// user-facing consequences (is_active_account() enforcement, see
// schema.sql) and, until now, zero test coverage.

const updateMock = vi.fn();
const logAdminActionMock = vi.fn();
let mockIsAdmin = true;
let mockTarget: { name: string } | null = { name: 'Some User' };

function buildMockSupabase() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          // Distinguishes requireAdmin()'s own lookup (by the CALLER's id,
          // admin-1) from the route's separate lookup of the TARGET user —
          // both go through profiles.select().eq().single(), but they must
          // resolve independently so a "target not found" test doesn't also
          // fail the admin check for the caller.
          select: () => ({
            eq: (_field: string, value: string) => ({
              single: () => Promise.resolve(
                value === 'admin-1'
                  ? { data: { is_admin: mockIsAdmin } }
                  : mockTarget === null ? { data: null } : { data: mockTarget }
              )
            })
          }),
          update: (payload: any) => { updateMock(payload); return { eq: () => Promise.resolve({ error: null }) }; }
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn(() => ({ auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: null } }) } } })) }));
vi.mock('@/lib/adminAudit', () => ({ logAdminAction: (...args: any[]) => { logAdminActionMock(...args); return Promise.resolve(); } }));

import { createClient } from '@/lib/supabase-server';
import { PATCH } from './route';

describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => {
    updateMock.mockClear();
    logAdminActionMock.mockClear();
    mockIsAdmin = true;
    mockTarget = { name: 'Some User' };
    (createClient as any).mockReturnValue(buildMockSupabase());
  });

  it('requires admin access', async () => {
    mockIsAdmin = false;
    const request = new Request('http://localhost/api/admin/users/user-1', { method: 'PATCH', body: JSON.stringify({ account_status: 'suspended' }) });
    const response = await PATCH(request, { params: { id: 'user-1' } });
    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('suspends a user and logs the action', async () => {
    const request = new Request('http://localhost/api/admin/users/user-1', { method: 'PATCH', body: JSON.stringify({ account_status: 'suspended' }) });
    const response = await PATCH(request, { params: { id: 'user-1' } });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ account_status: 'suspended' });
    expect(logAdminActionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'suspended user', targetType: 'user', targetId: 'user-1' }));
  });

  it('bans a user with the correct audit label', async () => {
    const request = new Request('http://localhost/api/admin/users/user-1', { method: 'PATCH', body: JSON.stringify({ account_status: 'banned' }) });
    await PATCH(request, { params: { id: 'user-1' } });
    expect(logAdminActionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'banned user' }));
  });

  it('reinstates a user with the correct audit label', async () => {
    const request = new Request('http://localhost/api/admin/users/user-1', { method: 'PATCH', body: JSON.stringify({ account_status: 'active' }) });
    await PATCH(request, { params: { id: 'user-1' } });
    expect(logAdminActionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'reinstated user' }));
  });

  it('rejects an invalid account_status rather than writing it', async () => {
    const request = new Request('http://localhost/api/admin/users/user-1', { method: 'PATCH', body: JSON.stringify({ account_status: 'deleted' }) });
    const response = await PATCH(request, { params: { id: 'user-1' } });
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean is_verified_organizer', async () => {
    const request = new Request('http://localhost/api/admin/users/user-1', { method: 'PATCH', body: JSON.stringify({ is_verified_organizer: 'yes' }) });
    const response = await PATCH(request, { params: { id: 'user-1' } });
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('returns 404 for a nonexistent target user', async () => {
    mockTarget = null;
    const request = new Request('http://localhost/api/admin/users/ghost', { method: 'PATCH', body: JSON.stringify({ account_status: 'suspended' }) });
    const response = await PATCH(request, { params: { id: 'ghost' } });
    expect(response.status).toBe(404);
  });
});
