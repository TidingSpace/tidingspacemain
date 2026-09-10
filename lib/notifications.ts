import type { SupabaseClient } from '@supabase/supabase-js';

// Fire-and-forget by design: a failed notification insert should never break
// the actual action (joining an activity, following someone, etc.) that
// triggered it. Errors are swallowed, not thrown.

export async function createNotification(
  supabase: SupabaseClient,
  params: {
    recipientId: string;
    actorId: string;
    type: string;
    activityId?: string | null;
    postId?: string | null;
    groupId?: string | null;
  }
) {
  if (params.recipientId === params.actorId) return; // never notify yourself about your own action
  try {
    await supabase.from('notifications').insert({
      recipient_id: params.recipientId,
      actor_id: params.actorId,
      type: params.type,
      activity_id: params.activityId ?? null,
      post_id: params.postId ?? null,
      group_id: params.groupId ?? null
    });
  } catch {
    // Intentionally ignored — see comment above.
  }
}

// Fan-out: notify every follower of `ofUserId` (e.g. "an organizer you follow
// published a new activity", "someone you follow joined an activity").
export async function notifyFollowers(
  supabase: SupabaseClient,
  params: {
    ofUserId: string;
    actorId: string;
    type: string;
    activityId?: string | null;
    excludeUserId?: string | null; // e.g. the activity's organizer, who already gets a more specific new_attendee notification for this same event — omitted everywhere else and behaves exactly as before
  }
) {
  try {
    const { data: followerRows } = await supabase
      .from('follows')
      .select('follower_id')
      .eq('followed_id', params.ofUserId);

    const recipients = (followerRows ?? [])
      .map((f: any) => f.follower_id)
      .filter((id: string) => id !== params.actorId && id !== params.excludeUserId);

    if (recipients.length === 0) return;

    await supabase.from('notifications').insert(
      recipients.map((recipientId: string) => ({
        recipient_id: recipientId,
        actor_id: params.actorId,
        type: params.type,
        activity_id: params.activityId ?? null
      }))
    );
  } catch {
    // Intentionally ignored — see comment above.
  }
}
