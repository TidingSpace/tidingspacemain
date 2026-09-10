import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { trackServerEvent } from '@/lib/analytics-server';

// POST /api/reports — file a report on a user, activity, post, group, or
// message. Exactly one of the reported_*_id fields should be set.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in to report something.' }, { status: 401 });

  // A tighter window than posts/comments — legitimate use is rare by nature,
  // and this specifically guards against using mass-reporting itself as a
  // harassment tool against another person or their content.
  const allowed = await checkRateLimit(supabase, user.id, 'create_report', 5, 3600); // 5 per hour
  if (!allowed) {
    return NextResponse.json({ error: "You've submitted several reports recently — please wait before submitting more." }, { status: 429 });
  }

  const { reported_user_id, reported_activity_id, reported_post_id, reported_group_id, reported_direct_message_id, reported_group_message_id, reason, details } = await request.json();

  if (!reason || !reason.trim()) {
    return NextResponse.json({ error: 'Please select a reason.' }, { status: 400 });
  }
  if (!reported_user_id && !reported_activity_id && !reported_post_id && !reported_group_id && !reported_direct_message_id && !reported_group_message_id) {
    return NextResponse.json({ error: 'Nothing specified to report.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: user.id,
      reported_user_id: reported_user_id ?? null,
      reported_activity_id: reported_activity_id ?? null,
      reported_post_id: reported_post_id ?? null,
      reported_group_id: reported_group_id ?? null,
      reported_direct_message_id: reported_direct_message_id ?? null,
      reported_group_message_id: reported_group_message_id ?? null,
      reason: reason.trim(),
      details: details?.trim() || null
    })
    .select()
    .single();

  if (error) {
    console.error('[/api/reports]', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  // Target TYPE only — never the reason or details text, both of which
  // are free-form (typed via a prompt(), not a fixed dropdown) and could
  // contain anything, including identifying information about the person
  // filing the report or whoever they're reporting.
  const targetType = reported_user_id ? 'user'
    : reported_activity_id ? 'activity'
    : reported_post_id ? 'post'
    : reported_group_id ? 'group'
    : reported_direct_message_id ? 'direct_message'
    : 'group_message';
  trackServerEvent(user.id, 'report_submitted', { target_type: targetType }).catch(() => {});

  return NextResponse.json({ report: data }, { status: 201 });
}
