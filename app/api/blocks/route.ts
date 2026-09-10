import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/blocks — list everyone you've blocked (the block/unblock actions
// already existed; this is just the missing "see the list" piece for Settings).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('blocks')
    .select('blocked:blocked_id ( id, name, avatar_color, avatar_url, handle )')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[/api/blocks]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ blocked: (data ?? []).map((r: any) => r.blocked).filter(Boolean) });
}
