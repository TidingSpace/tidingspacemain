import { describe, it, expect, vi, beforeEach } from 'vitest';

// Route-logic tests against a mocked Supabase client. Broadcasts reach every
// user matching an audience filter, so validation and admin-gating here
// matter more than most routes — previously untested.

const insertMock = vi.fn();
const logAdminActionMock = vi.fn();
const sendBroadcastMock = vi.fn();
let mockIsAdmin = true;

function buildMockSupabase() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { is_admin: mockIsAdmin } }) }) }) };
      }
      if (table === 'admin_broadcasts') {
        return {
          insert: (payload: any) => {
            insertMock(payload);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'broadcast-1', ...payload }, error: null }) }) };
          }
        };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    })
  };
}

vi.mock('@/lib/supabase-server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/adminAudit', () => ({ logAdminAction: (...args: any[]) => { logAdminActionMock(...args); return Promise.resolve(); } }));
vi.mock('@/lib/adminBroadcast', () => ({ sendBroadcast: (...args: any[]) => { sendBroadcastMock(...args); return Promise.resolve({ id: 'broadcast-1', status: 'sent' }); } }));

import { createClient } from '@/lib/supabase-server';
import { POST } from './route';

function makeRequest(body: any) {
  return new Request('http://localhost/api/admin/broadcasts', { method: 'POST', body: JSON.stringify(body) });
}

const validBody = { title: 'Heads up', message: 'Something is happening.', notification_type: 'announcement', audience_type: 'everyone' };

describe('POST /api/admin/broadcasts', () => {
  beforeEach(() => {
    insertMock.mockClear();
    logAdminActionMock.mockClear();
    sendBroadcastMock.mockClear();
    mockIsAdmin = true;
    (createClient as any).mockReturnValue(buildMockSupabase());
  });

  it('requires admin access', async () => {
    mockIsAdmin = false;
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('requires a title and message', async () => {
    const response = await POST(makeRequest({ ...validBody, title: '  ' }));
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid notification_type', async () => {
    const response = await POST(makeRequest({ ...validBody, notification_type: 'nonsense' }));
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid audience_type', async () => {
    const response = await POST(makeRequest({ ...validBody, audience_type: 'nonsense' }));
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('requires audience_value when targeting a category', async () => {
    const response = await POST(makeRequest({ ...validBody, audience_type: 'category', audience_value: '' }));
    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('saves as a draft and does not send when sendNow is not set', async () => {
    const response = await POST(makeRequest(validBody));
    expect(response.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    expect(sendBroadcastMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'saved broadcast draft' }));
  });

  it('sends immediately when sendNow is true, and logs it as sent', async () => {
    const response = await POST(makeRequest({ ...validBody, sendNow: true }));
    expect(response.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
    expect(sendBroadcastMock).toHaveBeenCalledWith(expect.anything(), 'broadcast-1');
    expect(logAdminActionMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'sent broadcast' }));
  });

  it('marks it scheduled when a future scheduled_at is given without sendNow', async () => {
    const response = await POST(makeRequest({ ...validBody, scheduled_at: '2099-01-01T00:00:00Z' }));
    expect(response.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'scheduled' }));
    expect(sendBroadcastMock).not.toHaveBeenCalled();
  });
});
