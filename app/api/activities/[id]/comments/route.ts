import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createNotification } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rateLimit';

// GET /api/activities/[id]/comments — public Q&A thread, anyone can read
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('activity_comments')
    .select('*, author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer )')
    .eq('activity_id', params.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[/api/activities/[id]/comments]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ comments: data });
}

// POST /api/activities/[id]/comments — anyone logged in can post (public Q&A,
// not restricted to attendees — see activity_messages for the private group chat)
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to comment.' }, { status: 401 });

  const allowed = await checkRateLimit(supabase, user.id, 'create_comment', 20, 300); // 20 per 5 minutes
  if (!allowed) {
    return NextResponse.json({ error: "You're commenting too quickly — please wait a few minutes and try again." }, { status: 429 });
  }

  const { text } = await request.json();
  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Comment cannot be empty.' }, { status: 400 });
  }
  if (text.length > 1000) {
    return NextResponse.json({ error: 'Comments are limited to 1000 characters.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('activity_comments')
    .insert({ activity_id: params.id, author_id: user.id, text: text.trim() })
    .select('*, author:author_id ( id, name, avatar_color, avatar_url, is_verified_organizer )')
    .single();

  if (error) {
    if (error.message.includes('row-level security')) {
      return NextResponse.json({ error: "You can't comment on this activity." }, { status: 403 });
    }
    console.error('[/api/activities/[id]/comments]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const { data: activity } = await supabase.from('activities').select('organizer_id').eq('id', params.id).single();
  if (activity) {
    await createNotification(supabase, { recipientId: activity.organizer_id, actorId: user.id, type: 'new_comment', activityId: params.id });
  }

  return NextResponse.json({ comment: data }, { status: 201 });
}
