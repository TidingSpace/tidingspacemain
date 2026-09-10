import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// PATCH /api/activities/[id]/pin — pin (or unpin, with message_id: null) a
// message. Organizer-only, matching activities_update_own's existing
// permission level (no "admin" concept for activities — just the one
// organizer, same as everywhere else in this app).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { message_id } = await request.json();

  const { data: activity } = await supabase.from('activities').select('organizer_id').eq('id', params.id).maybeSingle();
  if (!activity || activity.organizer_id !== user.id) {
    return NextResponse.json({ error: 'Only the organizer can pin messages.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('activities')
    .update({ pinned_message_id: message_id ?? null })
    .eq('id', params.id);

  if (error) {
    console.error('[/api/activities/[id]/pin]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ pinned: message_id ?? null });
}
