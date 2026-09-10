import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

const PAGE_SIZE = 20;

// GET /api/admin/reports?status=&type=&reason=&user=&page=0
// status: open|reviewed|dismissed|all (maps to Pending/Resolved/Dismissed
// in the UI — 'open' is the underlying DB value, kept as-is rather than
// renamed, since renaming it would mean touching every place that already
// reads/writes 'open' throughout this codebase for a label-only change).
// type: user|activity|post|group|message|all
// reason: exact match against reports.reason, or 'all'
// user: reported_user_id — reports filed AGAINST this specific user, used
// by the "View Reports" link on the admin User Detail page.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'open';
  const type = searchParams.get('type') ?? 'all';
  const reason = searchParams.get('reason') ?? 'all';
  const userId = searchParams.get('user');
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);

  let q = supabase
    .from('reports')
    .select(`
      id, reason, details, status, created_at,
      reporter:reporter_id ( id, name, handle ),
      reported_user:reported_user_id ( id, name, handle ),
      reported_activity:reported_activity_id ( id, title, status ),
      reported_post:reported_post_id ( id, text ),
      reported_group:reported_group_id ( id, name ),
      reported_direct_message:reported_direct_message_id ( id, text, sender:sender_id ( name ) ),
      reported_group_message:reported_group_message_id ( id, text, author:author_id ( name ) )
    `, { count: 'exact' });

  if (status !== 'all') q = q.eq('status', status);
  if (reason !== 'all') q = q.eq('reason', reason);
  if (userId) q = q.eq('reported_user_id', userId);
  if (type === 'user') q = q.not('reported_user_id', 'is', null);
  else if (type === 'activity') q = q.not('reported_activity_id', 'is', null);
  else if (type === 'post') q = q.not('reported_post_id', 'is', null);
  else if (type === 'group') q = q.not('reported_group_id', 'is', null);
  else if (type === 'message') q = q.or('reported_direct_message_id.not.is.null,reported_group_message_id.not.is.null');

  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (error) {
    console.error('[/api/admin/reports]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  let filteredUser: { id: string; name: string; handle: string } | null = null;
  if (userId) {
    const { data: userRow } = await supabase.from('profiles').select('id, name, handle').eq('id', userId).single();
    filteredUser = userRow ?? null;
  }

  return NextResponse.json({ reports: data, totalCount: count ?? 0, filteredUser });
}
