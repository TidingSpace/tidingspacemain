import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { NextResponse } from 'next/server';

type Action = 'dismiss' | 'hide_content' | 'delete_content' | 'suspend_user';

// POST /api/admin/reports/[id] — the moderation action for one report.
// Every action also marks the report 'reviewed' (except dismiss, which
// marks it 'dismissed') so it drops out of the open queue, and every
// action is logged to the audit trail with enough detail to reconstruct
// what happened without needing to guess.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user: adminUser } = admin;

  const { action } = await request.json() as { action: Action };

  const { data: report } = await supabase
    .from('reports')
    .select('reported_user_id, reported_activity_id, reported_post_id, reported_group_id, reported_direct_message_id, reported_group_message_id, reason')
    .eq('id', params.id)
    .single();
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });

  if (action === 'dismiss') {
    await supabase.from('reports').update({ status: 'dismissed' }).eq('id', params.id);
    await logAdminAction(supabase, { adminId: adminUser.id, action: 'dismissed report', targetType: 'report', targetId: params.id, details: report.reason });
    return NextResponse.json({ ok: true });
  }

  if (action === 'suspend_user') {
    if (!report.reported_user_id) return NextResponse.json({ error: 'This report has no associated user.' }, { status: 400 });
    await supabase.from('profiles').update({ account_status: 'suspended' }).eq('id', report.reported_user_id);
    await logAdminAction(supabase, { adminId: adminUser.id, action: 'suspended user (via report)', targetType: 'user', targetId: report.reported_user_id, details: report.reason });
  } else if (action === 'hide_content' || action === 'delete_content') {
    const hide = action === 'hide_content';
    if (report.reported_activity_id) {
      await supabase.from('activities').update(hide ? { status: 'hidden' } : {}).eq('id', report.reported_activity_id);
      if (!hide) await supabase.from('activities').delete().eq('id', report.reported_activity_id);
      await logAdminAction(supabase, { adminId: adminUser.id, action: `${hide ? 'hid' : 'deleted'} activity (via report)`, targetType: 'activity', targetId: report.reported_activity_id, details: report.reason });
    } else if (report.reported_post_id) {
      if (hide) await supabase.from('posts').update({ hidden: true }).eq('id', report.reported_post_id);
      else await supabase.from('posts').delete().eq('id', report.reported_post_id);
      await logAdminAction(supabase, { adminId: adminUser.id, action: `${hide ? 'hid' : 'deleted'} post (via report)`, targetType: 'post', targetId: report.reported_post_id, details: report.reason });
    } else if (report.reported_group_id) {
      if (hide) await supabase.from('groups').update({ hidden: true }).eq('id', report.reported_group_id);
      else await supabase.from('groups').delete().eq('id', report.reported_group_id);
      await logAdminAction(supabase, { adminId: adminUser.id, action: `${hide ? 'hid' : 'deleted'} group (via report)`, targetType: 'group', targetId: report.reported_group_id, details: report.reason });
    } else if (report.reported_direct_message_id || report.reported_group_message_id) {
      // A message has no meaningful "hidden but still present" state the
      // way a post or activity does — it either stays in the thread or it
      // doesn't. Both actions remove it; "hide" and "delete" aren't
      // functionally different here, but the action verb is still logged
      // accurately in the audit trail so it's clear which button was pressed.
      if (report.reported_direct_message_id) {
        await supabase.from('direct_messages').delete().eq('id', report.reported_direct_message_id);
        await logAdminAction(supabase, { adminId: adminUser.id, action: `${hide ? 'hid' : 'deleted'} direct message (via report)`, targetType: 'post', targetId: report.reported_direct_message_id, details: report.reason });
      } else {
        await supabase.from('group_messages').delete().eq('id', report.reported_group_message_id);
        await logAdminAction(supabase, { adminId: adminUser.id, action: `${hide ? 'hid' : 'deleted'} group message (via report)`, targetType: 'group', targetId: report.reported_group_message_id, details: report.reason });
      }
    } else {
      return NextResponse.json({ error: 'This report has no content to hide or delete (it targets a user).' }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  await supabase.from('reports').update({ status: 'reviewed' }).eq('id', params.id);
  return NextResponse.json({ ok: true });
}
