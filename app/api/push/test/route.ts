import { createClient } from '@/lib/supabase-server';
import { sendPushToUserVerbose } from '@/lib/pushNotifications';
import { NextResponse } from 'next/server';

// POST /api/push/test — sends a real test push to every device the
// current user has subscribed on, and returns exactly what happened for
// each one. This exists purely for diagnosing "I enabled push but nothing
// arrives" without needing to send a real message and wait, which
// conflates several separate questions (did the message endpoint even run
// the push code? was it even the right recipient?) into one slow,
// ambiguous test.
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await sendPushToUserVerbose(user.id, {
    title: 'Test notification',
    body: 'If you can see this, push notifications are working correctly.',
    url: '/settings',
    tag: 'push-test'
  });

  return NextResponse.json(result);
}
