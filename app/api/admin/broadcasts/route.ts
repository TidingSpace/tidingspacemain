import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { sendBroadcast } from '@/lib/adminBroadcast';
import { NextResponse } from 'next/server';

const PAGE_SIZE = 20;

// GET /api/admin/broadcasts?page=0 — send history, newest first.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);

  const { data, count, error } = await supabase
    .from('admin_broadcasts')
    .select('*, created_by_profile:created_by ( name, handle )', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (error) { console.error('[/api/admin/broadcasts]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ broadcasts: data, totalCount: count ?? 0 });
}

// POST /api/admin/broadcasts — create a broadcast, either as a draft, or
// sent immediately (sendNow: true). Scheduling (a future scheduled_at with
// automatic delivery) is stored correctly but NOT automatically executed —
// see the route-level comment further down for exactly what backend piece
// is still required for that.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const body = await request.json();
  const { title, message, notification_type, audience_type, audience_value, scheduled_at, sendNow } = body;

  if (!title?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'Title and message are both required.' }, { status: 400 });
  }
  if (!['information', 'announcement', 'warning', 'maintenance'].includes(notification_type)) {
    return NextResponse.json({ error: 'Invalid notification type.' }, { status: 400 });
  }
  if (!['everyone', 'city', 'category', 'organizers', 'user'].includes(audience_type)) {
    return NextResponse.json({ error: 'Invalid audience type.' }, { status: 400 });
  }
  if ((audience_type === 'category' || audience_type === 'user') && !audience_value?.trim()) {
    return NextResponse.json({ error: 'This audience type requires a value (category key or user id).' }, { status: 400 });
  }

  const status = sendNow ? 'sent' : scheduled_at ? 'scheduled' : 'draft';

  const { data: broadcast, error: insertError } = await supabase
    .from('admin_broadcasts')
    .insert({
      title: title.trim(),
      message: message.trim(),
      notification_type,
      audience_type,
      audience_value: audience_value?.trim() || null,
      status,
      scheduled_at: scheduled_at || null,
      created_by: user.id
    })
    .select()
    .single();

  if (insertError) { console.error('[/api/admin/broadcasts]', insertError.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

  await logAdminAction(supabase, {
    adminId: user.id,
    action: sendNow ? 'sent broadcast' : scheduled_at ? 'scheduled broadcast' : 'saved broadcast draft',
    targetType: 'report', // no dedicated 'broadcast' target type exists yet in the audit log's fixed set — closest existing category
    targetId: broadcast.id,
    details: title.trim()
  });

  if (!sendNow) {
    // Scheduled-but-not-sent-yet, or a plain draft — nothing left to do
    // now. A scheduled broadcast will be picked up and sent automatically
    // by /api/cron/send-scheduled-broadcasts (see vercel.json), which runs
    // once daily (see vercel.json) and reuses the same sendBroadcast()
    // logic as the manual Send action. Not every 5 minutes — Vercel's
    // Hobby plan rejects deploys with cron schedules more frequent than
    // once a day, so this runs once daily by default; change the schedule
    // in vercel.json to e.g. "*/5 * * * *" if/when on a paid plan that
    // supports more frequent runs, for closer-to-real-time sending.
    return NextResponse.json({ broadcast });
  }

  const sendResult = await sendBroadcast(supabase, broadcast.id);
  return NextResponse.json({ broadcast: sendResult });
}

