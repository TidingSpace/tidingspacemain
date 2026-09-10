import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

// DELETE /api/account — permanently delete the caller's own account.
//
// What actually happens: profiles.id references auth.users(id) on delete
// cascade, and every user-owned table in this schema (activities, posts,
// comments, messages, groups, rsvps, follows, etc.) already references
// profiles(id) on delete cascade too. So deleting the auth.users row is the
// one action that correctly removes everything this account owns —
// including activities they organized (and, by further cascade, that
// activity's RSVPs and chat history) and groups they created. This is the
// same cascade behavior this schema already has everywhere else; this
// route doesn't introduce new deletion logic, it triggers the one that
// already exists.
//
// Uploaded files are a separate system from these relational cascades and
// aren't touched by them. This route cleans up the account's avatar
// specifically (a single, known path) before deleting. It deliberately does
// NOT hunt down every activity-cover/post-image/chat-image this account
// ever uploaded — those become orphaned objects in Storage once their
// owning rows are gone (harmless: nothing references them anymore, so
// nothing can display them broken; it only costs some unused storage
// space), the same kind of accepted trade-off as rate_limit_log's
// unbounded growth elsewhere in this project. A full storage sweep is a
// reasonable follow-up, not a blocker for this feature.
export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();

  const admin = createAdminClient();

  if (profile?.avatar_url) {
    const path = profile.avatar_url.split('/avatars/')[1];
    if (path) await admin.storage.from('avatars').remove([path]);
  }

  // Acting on `user.id` — taken from the caller's own verified session
  // above, never from a request body or param — is what keeps this route
  // safe despite using an RLS-bypassing client: there's no way to pass a
  // different user's id in and have this delete their account instead.
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    console.error('[/api/account] DELETE', error.message);
    return NextResponse.json({ error: 'Something went wrong deleting your account. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ deleted: true });
}
