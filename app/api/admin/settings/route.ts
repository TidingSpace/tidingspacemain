import { requireAdmin } from '@/lib/adminAuth';
import { logAdminAction } from '@/lib/adminAudit';
import { NextResponse } from 'next/server';

// GET /api/admin/settings — every configured platform setting.
export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { data, error } = await admin.supabase.from('platform_settings').select('*').order('key');
  if (error) { console.error('[/api/admin/settings]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ settings: data });
}

// PATCH /api/admin/settings — update one setting's value. One key at a
// time, not a bulk update, so each change gets its own clear audit log
// entry rather than one vague "settings changed" entry covering several
// unrelated values at once.
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const { key, value } = await request.json();
  if (!key || value === undefined) return NextResponse.json({ error: 'key and value are both required.' }, { status: 400 });

  const { data: existing } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle();

  const { error } = await supabase
    .from('platform_settings')
    .update({ value: String(value), updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('key', key);

  if (error) { console.error('[/api/admin/settings]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }

  await logAdminAction(supabase, {
    adminId: user.id,
    action: 'changed platform setting',
    targetType: 'category', // no dedicated 'setting' target type exists in the audit log's fixed set — closest existing category for a config change
    targetId: key,
    details: `${key}: ${existing?.value ?? '?'} → ${value}`
  });

  return NextResponse.json({ ok: true });
}
