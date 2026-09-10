// Simple in-memory cache for the maintenance_mode platform setting, used by
// middleware.ts. Deliberately not Redis or any external cache — this is a
// single boolean, read on (almost) every request, and an edge/serverless
// runtime already gives each instance its own memory; a short in-process
// TTL is enough to avoid hitting the database on every single request
// without adding real infrastructure for a problem this small. The
// trade-off: toggling Maintenance Mode can take up to TTL_MS to take full
// effect across all running instances — an accepted, reasonable delay for
// an admin-triggered, infrequent action, not something needing instant
// global consistency.
const TTL_MS = 30_000;
let cached: { value: boolean; fetchedAt: number } | null = null;

export async function getMaintenanceMode(
  supabase: { from: (table: string) => any }
): Promise<boolean> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.value;
  }
  // .maybeSingle(), not .single() — .single() returns an actual error
  // response (406) whenever zero rows match, which is exactly what was
  // showing up repeatedly in Supabase's logs when this row was missing.
  // .maybeSingle() returns null cleanly instead, letting the existing
  // data?.value fallback below handle it gracefully either way — this is
  // what makes a missing row a quiet, harmless default instead of a
  // visible error on every request.
  const { data } = await supabase.from('platform_settings').select('value').eq('key', 'maintenance_mode').maybeSingle();
  const value = data?.value === 'true';
  cached = { value, fetchedAt: Date.now() };
  return value;
}
