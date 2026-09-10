import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';

// POST /api/saved/activities/[id] — bookmark an activity
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('saved_activities')
    .upsert({ user_id: user.id, activity_id: params.id }, { onConflict: 'user_id,activity_id' });

  if (error) {
    console.error('[/api/saved/activities/[id]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const { data: activity } = await supabase.from('activities').select('organizer_id').eq('id', params.id).single();
  if (activity) {
    await createNotification(supabase, { recipientId: activity.organizer_id, actorId: user.id, type: 'activity_saved', activityId: params.id });
  }

  return NextResponse.json({ saved: true });
}

// DELETE /api/saved/activities/[id] — remove the bookmark
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('saved_activities')
    .delete()
    .eq('user_id', user.id)
    .eq('activity_id', params.id);

  if (error) {
    console.error('[/api/saved/activities/[id]]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ saved: false });
}
