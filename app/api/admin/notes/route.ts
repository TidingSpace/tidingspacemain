import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

// GET /api/admin/notes?targetType=user&targetId=... — every note on one
// target, newest first. Never exposed anywhere in the public application.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get('targetType');
  const targetId = searchParams.get('targetId');
  if (!targetType || !targetId) return NextResponse.json({ error: 'targetType and targetId are required.' }, { status: 400 });

  const { data, error } = await supabase
    .from('admin_notes')
    .select('id, content, created_at, updated_at, admin:admin_id ( id, name, handle )')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false });

  if (error) { console.error('[/api/admin/notes]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ notes: data });
}

// POST /api/admin/notes — add a note to a user/activity/group/organizer.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const { targetType, targetId, content } = await request.json();
  if (!['user', 'activity', 'group', 'organizer'].includes(targetType)) {
    return NextResponse.json({ error: 'Invalid target type.' }, { status: 400 });
  }
  if (!targetId || !content?.trim()) {
    return NextResponse.json({ error: 'targetId and content are both required.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('admin_notes')
    .insert({ target_type: targetType, target_id: targetId, admin_id: user.id, content: content.trim() })
    .select('id, content, created_at, updated_at, admin:admin_id ( id, name, handle )')
    .single();

  if (error) { console.error('[/api/admin/notes]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ note: data }, { status: 201 });
}
