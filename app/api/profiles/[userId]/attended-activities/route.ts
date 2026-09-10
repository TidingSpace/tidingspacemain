import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/profiles/[userId]/attended-activities — activities this person
// has actually attended (a confirmed RSVP), for the "Activities" stat on
// their profile. Deliberately minimal fields — just enough to render an
// icon and a title, nothing that exposes who else was there, exact
// address, or anything else not this person's business to show off.
// Distinct from `organizing` (activities they created), which the profile
// API already returns separately.
export async function GET(_request: Request, { params }: { params: { userId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('rsvps')
    .select('activity:activity_id ( id, title, category, starts_at, status )')
    .eq('user_id', params.userId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error('[/api/profiles/[userId]/attended-activities]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Filter out hidden activities here rather than in the query — an
  // admin-hidden activity shouldn't appear in someone's public history,
  // but a cancelled one is still true history (they did RSVP), so only
  // 'hidden' specifically is excluded, not 'cancelled'.
  const activities = (data ?? [])
    .map((row: any) => row.activity)
    .filter((a: any) => a && a.status !== 'hidden');

  return NextResponse.json({ activities });
}
