import type { createClient } from '@/lib/supabase-server';

type TargetType = 'user' | 'activity' | 'post' | 'group' | 'report' | 'category';

// The one function every admin mutation route calls to log itself — not
// left to each route to remember on its own. Failures here are logged but
// never thrown: a logging failure should never block the actual admin
// action from completing (an admin correctly suspending an abusive account
// shouldn't fail just because the audit row didn't insert), but it should
// still be visible in server logs since a missing audit entry is itself a
// real problem worth noticing.
export async function logAdminAction(
  supabase: ReturnType<typeof createClient>,
  params: { adminId: string; action: string; targetType: TargetType; targetId?: string | null; details?: string | null }
) {
  const { error } = await supabase.from('admin_audit_log').insert({
    admin_id: params.adminId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    details: params.details ?? null
  });
  if (error) console.error('[logAdminAction] failed to write audit entry:', error.message);
}
