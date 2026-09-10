import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// POST /api/push/subscribe — saves (or updates) a browser's push
// subscription for the current user. Called once when someone enables
// push notifications, and again automatically if the browser ever
// rotates the subscription's keys (the Push API does this occasionally;
// upserting on endpoint handles that transparently).
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint, keys } = await request.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ endpoint, user_id: user.id, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' });

  if (error) { console.error('[/api/push/subscribe]', error.message); return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

// DELETE /api/push/subscribe — removes a subscription, e.g. when someone
// turns push notifications back off.
export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { endpoint } = await request.json();
  if (!endpoint) return NextResponse.json({ error: 'endpoint is required.' }, { status: 400 });

  // Scoped to the caller's own user_id too, not just endpoint — RLS
  // already enforces this, but being explicit here avoids relying on RLS
  // as the only thing standing between this and deleting someone else's row.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
