import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { sendBroadcast } from '@/lib/adminBroadcast';
import { NextResponse } from 'next/server';

// POST /api/admin/broadcasts/[id]/send — manually send a draft or scheduled
// broadcast right now. This is also the ONLY way a scheduled broadcast
// currently gets sent — there's no automatic job that fires at
// scheduled_at yet (see the TODO in the main broadcasts route for what
// that would require).
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const { data: existing } = await supabase.from('admin_broadcasts').select('status, title').eq('id', params.id).single();
  if (!existing) return NextResponse.json({ error: 'Broadcast not found.' }, { status: 404 });
  if (existing.status === 'sent') return NextResponse.json({ error: 'This broadcast has already been sent.' }, { status: 400 });

  const result = await sendBroadcast(supabase, params.id);
  await logAdminAction(supabase, { adminId: user.id, action: 'sent broadcast', targetType: 'report', targetId: params.id, details: existing.title });

  return NextResponse.json({ broadcast: result });
}
