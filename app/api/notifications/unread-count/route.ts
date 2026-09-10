import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /api/notifications/unread-count — just a number, for badges on the bell
// icon across the app. Deliberately does NOT mark anything as read — only
// actually opening the Notifications page does that.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null);

  return NextResponse.json({ count: count ?? 0 });
}
