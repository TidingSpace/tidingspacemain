import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { NextResponse } from 'next/server';

// GET /api/admin/categories — every category, ordered for management.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { data, error } = await admin.supabase.from('categories').select('*').order('sort_order').order('key');
  if (error) { console.error('[/api/admin/categories]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ categories: data });
}

// POST /api/admin/categories — create a new category. New ones go to the
// end of the sort order by default (max existing + 1).
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const { key, label, icon } = await request.json();
  if (!key || !label || !icon) return NextResponse.json({ error: 'key, label, and icon are all required.' }, { status: 400 });

  const { data: existing } = await supabase.from('categories').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('categories').insert({ key, label, icon, sort_order: nextOrder });
  if (error) { console.error('[/api/admin/categories]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

  await logAdminAction(supabase, { adminId: user.id, action: 'created category', targetType: 'category', targetId: key, details: label });
  return NextResponse.json({ ok: true }, { status: 201 });
}
