// Shared broadcast fan-out logic — used by both the "send immediately" path
// (POST /api/admin/broadcasts) and the manual "Send" action on an existing
// draft/scheduled broadcast (POST /api/admin/broadcasts/[id]/send). Lives
// here rather than being exported from a route.ts file, since Next.js App
// Router route files are expected to only export HTTP method handlers.
// Fetches every row for a query, paginating past PostgREST's default
// 1000-row-per-request cap. Found during a security/correctness review:
// none of the fan-out queries below paginated, meaning "Send to Everyone"
// would have silently notified only the first 1000 users on any platform
// larger than that — not a data-exposure issue, but a real reliability bug
// for exactly the kind of growth this app is meant to handle.
async function fetchAllRows(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 1000;
  let page = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(page * pageSize, page * pageSize + pageSize - 1);
    if (filter) q = filter(q);
    const { data } = await q;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    page += 1;
  }
  return rows;
}

export async function sendBroadcast(supabase: any, broadcastId: string) {
  const { data: broadcast } = await supabase.from('admin_broadcasts').select('*').eq('id', broadcastId).single();
  if (!broadcast) return null;

  let recipientIds: string[] = [];

  if (broadcast.audience_type === 'everyone') {
    const data = await fetchAllRows(supabase, 'profiles', 'id');
    recipientIds = data.map((p: any) => p.id);
  } else if (broadcast.audience_type === 'organizers') {
    const data = await fetchAllRows(supabase, 'activities', 'organizer_id');
    recipientIds = Array.from(new Set(data.map((a: any) => a.organizer_id)));
  } else if (broadcast.audience_type === 'category') {
    const data = await fetchAllRows(supabase, 'profile_interests', 'profile_id', (q) => q.eq('category_key', broadcast.audience_value));
    recipientIds = Array.from(new Set(data.map((p: any) => p.profile_id)));
  } else if (broadcast.audience_type === 'user') {
    recipientIds = [broadcast.audience_value];
  } else if (broadcast.audience_type === 'city') {
    // NOT IMPLEMENTED — profiles have no city field anywhere in this
    // schema, and no other reliable way to infer "this user is in city X"
    // exists (activity locations are per-activity, not per-user). Rather
    // than silently fall back to "everyone" or guess from some heuristic,
    // this fails clearly so an admin never believes a city-targeted
    // broadcast went to the right people when it couldn't have gone to
    // anyone in a meaningful, city-specific way.
    await supabase.from('admin_broadcasts').update({
      status: 'failed',
      failure_reason: 'City-based targeting has no backend support yet — profiles have no stored city. Add a profiles.city column (and a way for users to set it) to enable this.'
    }).eq('id', broadcastId);
    const { data: failed } = await supabase.from('admin_broadcasts').select('*').eq('id', broadcastId).single();
    return failed;
  }

  if (recipientIds.length === 0) {
    await supabase.from('admin_broadcasts').update({
      status: 'failed',
      failure_reason: 'No matching recipients were found for this audience.'
    }).eq('id', broadcastId);
    const { data: failed } = await supabase.from('admin_broadcasts').select('*').eq('id', broadcastId).single();
    return failed;
  }

  const rows = recipientIds.map((recipientId) => ({
    recipient_id: recipientId,
    actor_id: broadcast.created_by,
    type: 'admin_broadcast',
    broadcast_id: broadcastId
  }));

  const { error: fanoutError } = await supabase.from('notifications').insert(rows);
  if (fanoutError) {
    await supabase.from('admin_broadcasts').update({ status: 'failed', failure_reason: fanoutError.message }).eq('id', broadcastId);
  } else {
    await supabase.from('admin_broadcasts').update({
      status: 'sent', sent_at: new Date().toISOString(), recipient_count: recipientIds.length
    }).eq('id', broadcastId);
  }

  const { data: updated } = await supabase.from('admin_broadcasts').select('*').eq('id', broadcastId).single();
  return updated;
}
