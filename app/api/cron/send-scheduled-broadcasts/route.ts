import { createAdminClient } from '@/lib/supabase-admin';
import { sendBroadcast } from '@/lib/adminBroadcast';
import { logAdminAction } from '@/lib/adminAudit';
import { NextResponse } from 'next/server';

// GET /api/cron/send-scheduled-broadcasts — runs on a schedule via Vercel
// Cron (see vercel.json), not triggered by any user action. Finds every
// broadcast whose scheduled_at has arrived and actually sends it, reusing
// the exact same sendBroadcast() logic the manual "Send Now" button uses —
// this is not a second, parallel implementation of sending.
//
// Why this needs the admin client: there's no logged-in user in a
// scheduled job — no auth.uid() for RLS to scope by — so this reuses the
// same narrow, documented admin-client exception already established for
// account deletion and the rate-limit-log cleanup cron, rather than
// introducing a new pattern.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error: fetchError } = await admin
    .from('admin_broadcasts')
    .select('id, title, created_by')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso);

  if (fetchError) {
    console.error('[/api/cron/send-scheduled-broadcasts] fetch failed:', fetchError.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const results: { id: string; outcome: 'sent' | 'failed' | 'skipped' | 'claim_failed' }[] = [];

  for (const broadcast of due ?? []) {
    // Atomic claim — the actual duplicate-send prevention. Only succeeds
    // (affects a row) if this broadcast is still 'scheduled' right now;
    // if another overlapping run already claimed it, this affects zero
    // rows and we skip it safely rather than sending it a second time.
    const { data: claimed, error: claimError } = await admin
      .from('admin_broadcasts')
      .update({ status: 'sending' })
      .eq('id', broadcast.id)
      .eq('status', 'scheduled')
      .select('id');

    if (claimError) {
      console.error(`[/api/cron/send-scheduled-broadcasts] claim failed for ${broadcast.id}:`, claimError.message);
      results.push({ id: broadcast.id, outcome: 'claim_failed' });
      continue;
    }
    if (!claimed || claimed.length === 0) {
      // Already claimed by another run — not an error, just a skip.
      results.push({ id: broadcast.id, outcome: 'skipped' });
      continue;
    }

    try {
      const sent = await sendBroadcast(admin, broadcast.id);
      const outcome = sent?.status === 'sent' ? 'sent' : 'failed';
      results.push({ id: broadcast.id, outcome });

      // Attributed to whichever admin originally scheduled it — a real,
      // meaningful attribution, even though the send itself was automatic.
      // Skipped only if that admin's account was later deleted
      // (created_by is nullable on delete set null), since
      // logAdminAction requires a real admin id.
      if (broadcast.created_by) {
        await logAdminAction(admin as any, {
          adminId: broadcast.created_by,
          action: outcome === 'sent' ? 'auto-sent scheduled broadcast' : 'scheduled broadcast failed to auto-send',
          targetType: 'report',
          targetId: broadcast.id,
          details: broadcast.title
        });
      }
    } catch (e: any) {
      // A genuinely unexpected failure (not the ordinary "no recipients
      // matched" case, which sendBroadcast already handles gracefully by
      // marking the broadcast 'failed' itself) — log it and move on to the
      // next due broadcast rather than letting one failure abort the batch.
      console.error(`[/api/cron/send-scheduled-broadcasts] unexpected error sending ${broadcast.id}:`, e?.message ?? e);
      await admin.from('admin_broadcasts').update({ status: 'failed', failure_reason: 'Unexpected error during scheduled send.' }).eq('id', broadcast.id);
      results.push({ id: broadcast.id, outcome: 'failed' });
    }
  }

  console.log(`[/api/cron/send-scheduled-broadcasts] processed ${results.length} due broadcast(s):`, results);
  return NextResponse.json({ processed: results.length, results });
}
