import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

const PAGE_SIZE = 30;

// GET /api/admin/audit-log?page=0 — every logged admin action, newest
// first. Written to by logAdminAction() (lib/adminAudit.ts), called from
// every mutating admin route in this panel.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);

  const { data, count, error } = await supabase
    .from('admin_audit_log')
    .select('id, action, target_type, target_id, details, created_at, admin:admin_id ( name, handle )', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (error) { console.error('[/api/admin/audit-log]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ entries: data, totalCount: count ?? 0 });
}
