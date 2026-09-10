import { requireAdmin } from '@/lib/adminAuth';
import { NextResponse } from 'next/server';

// PATCH /api/admin/notes/[id] — edit a note's content. Any admin can edit
// any note (not just its original author) — these are shared operational
// context between admins, not personal to whoever wrote them.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { content } = await request.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Content is required.' }, { status: 400 });

  const { error } = await supabase.from('admin_notes').update({ content: content.trim(), updated_at: new Date().toISOString() }).eq('id', params.id);
  if (error) { console.error('[/api/admin/notes/[id]]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase } = admin;

  const { error } = await supabase.from('admin_notes').delete().eq('id', params.id);
  if (error) { console.error('[/api/admin/notes/[id]]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
