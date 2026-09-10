import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-logic tests against a mocked Supabase client. Category creation is
// the one action that can silently produce a broken map pin/filter chip if
// the icon path doesn't match an existing icon file — see
// lib/categoryGroups.ts's "if you add a category, add its icon here too"
// note. This doesn't (and can't) test the icon-file side of that, but it
// does lock down the request-validation and audit-logging behavior, which
// previously had zero coverage.

const insertMock = vi.fn();
const logAdminActionMock = vi.fn();
let mockIsAdmin = true;
let mockMaxSortOrder: { sort_order: number }[] = [{ sort_order: 4 }];

function buildMockSupabase() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { is_admin: mockIsAdmin } }) }) }) };
      }
      if (table === 'categories') {
        return {
          select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: mockMaxSortOrder }) }) }),
          insert: (payload: any) => { insertMock(payload); return Promise.resolve({ error: null }); }
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/adminAudit', () => ({ logAdminAction: (...args: any[]) => { logAdminActionMock(...args); return Promise.resolve(); } }));

import { createClient } from '@/lib/supabase-server';
import { POST } from './route';

function makeRequest(body: any) {
  return new Request('http://localhost/api/admin/categories', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/admin/categories', () => {
  beforeEach(() => {
    insertMock.mockClear();
    logAdminActionMock.mockClear();
    mockIsAdmin = true;
    mockMaxSortOrder = [{ sort_order: 4 }];
    (createClient as any).mockReturnValue(buildMockSupabase());
  });

  it('requires admin access', async () => {
    mockIsAdmin = false;
    const response = await POST(makeRequest({ key: 'surfing', label: 'Surfing', icon: '/icons/categories/surfing.svg' }));
    expect(response.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('requires key, label, and icon', async () => {
    const response = await POST(makeRequest({ key: 'surfing', label: 'Surfing' }));
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('creates the category one past the current max sort_order', async () => {
    const response = await POST(makeRequest({ key: 'surfing', label: 'Surfing', icon: '/icons/categories/surfing.svg' }));
    expect(response.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ key: 'surfing', label: 'Surfing', icon: '/icons/categories/surfing.svg', sort_order: 5 }));
  });

  it('starts at sort_order 0 when no categories exist yet', async () => {
    mockMaxSortOrder = [];
    await POST(makeRequest({ key: 'surfing', label: 'Surfing', icon: '/icons/categories/surfing.svg' }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 0 }));
  });

  it('logs the creation to the audit trail', async () => {
    await POST(makeRequest({ key: 'surfing', label: 'Surfing', icon: '/icons/categories/surfing.svg' }));
    expect(logAdminActionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'created category', targetType: 'category', targetId: 'surfing' }));
  });
});
