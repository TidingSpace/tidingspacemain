import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { NextResponse } from 'next/server';

// PATCH /api/admin/categories/[key] — edit label/icon, or reorder
// (sort_order). Key itself is immutable — it's what activities.category
// actually references, so changing it would silently orphan every
// activity already using this category.
export async function PATCH(request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.label === 'string') updates.label = body.label;
  if (typeof body.icon === 'string') updates.icon = body.icon;
  if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order;

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const { error } = await supabase.from('categories').update(updates).eq('key', params.key);
  if (error) { console.error('[/api/admin/categories/[key]]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

  await logAdminAction(supabase, { adminId: user.id, action: 'edited category', targetType: 'category', targetId: params.key, details: JSON.stringify(updates) });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/categories/[key] — blocked if any activity still uses
// this category (activities.category has no FK to categories, so deleting
// an in-use category would silently orphan those rows' icon/label lookup
// rather than fail loudly at the database level — this check is what
// actually prevents that).
export async function DELETE(_request: Request, { params }: { params: { key: string } }) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const { count } = await supabase.from('activities').select('*', { count: 'exact', head: true }).eq('category', params.key);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `${count} activities still use this category — reassign or remove them first.` }, { status: 400 });
  }

  const { error } = await supabase.from('categories').delete().eq('key', params.key);
  if (error) { console.error('[/api/admin/categories/[key]]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

  await logAdminAction(supabase, { adminId: user.id, action: 'deleted category', targetType: 'category', targetId: params.key });
  return NextResponse.json({ ok: true });
}
