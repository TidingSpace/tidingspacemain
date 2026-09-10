import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

// GET /api/admin/reports/pending-count — a single, cheap count query
// (head: true, no rows returned) used to show a badge on the admin
// sidebar's Reports link. Deliberately its own tiny endpoint rather than
// folded into the main reports list route, since the sidebar polls this
// on every admin page, not just the Reports page itself.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  const { count } = await admin.supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open');

  return NextResponse.json({ count: count ?? 0 });
}
