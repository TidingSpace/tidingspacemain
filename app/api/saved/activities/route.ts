import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/saved/activities — everything you've bookmarked, most recent first
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('saved_activities')
    .select('created_at, activity:activity_id ( *, profiles:organizer_id ( name ) )')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.error('[/api/saved/activities]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ saved: data });
}
