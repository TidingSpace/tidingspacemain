-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Closes a real, verified gap found during a security review: suspend/ban
-- (account_status) was enforced on activities/posts/comments but NOT on
-- RSVPs, direct messages, group messages, or group creation — meaning a
-- suspended or banned account could still join activities, message people,
-- and post in groups. This adds is_active_account() enforcement to all
-- five of those write paths.

drop policy if exists "rsvps_insert_own" on rsvps;
create policy "rsvps_insert_own" on rsvps for insert with check (
  auth.uid() = user_id
  and is_active_account(auth.uid())
  and not exists (
    select 1 from blocks b
    join activities a on a.id = rsvps.activity_id
    where (b.blocker_id = auth.uid() and b.blocked_id = a.organizer_id)
       or (b.blocker_id = a.organizer_id and b.blocked_id = auth.uid())
  )
);

drop policy if exists "dm_insert_own" on direct_messages;
create policy "dm_insert_own" on direct_messages for insert with check (
  auth.uid() = sender_id
  and is_active_account(auth.uid())
  and not exists (
    select 1 from blocks
    where (blocker_id = recipient_id and blocked_id = sender_id)
       or (blocker_id = sender_id and blocked_id = recipient_id)
  )
);

drop policy if exists "group_messages_insert" on group_messages;
create policy "group_messages_insert" on group_messages for insert with check (
  auth.uid() = author_id
  and is_active_account(auth.uid())
  and is_group_member(group_id, auth.uid())
);

drop policy if exists "groups_insert_own" on groups;
create policy "groups_insert_own" on groups for insert with check (auth.uid() = creator_id and is_active_account(auth.uid()));

drop policy if exists "activity_comments_insert_own" on activity_comments;
create policy "activity_comments_insert_own" on activity_comments for insert with check (
  auth.uid() = author_id
  and is_active_account(auth.uid())
  and not exists (
    select 1 from blocks b
    join activities a on a.id = activity_comments.activity_id
    where (b.blocker_id = auth.uid() and b.blocked_id = a.organizer_id)
       or (b.blocker_id = a.organizer_id and b.blocked_id = auth.uid())
  )
);

-- Verify — should show is_active_account referenced in all five:
select tablename, policyname, qual from pg_policies
where policyname in ('rsvps_insert_own', 'dm_insert_own', 'group_messages_insert', 'groups_insert_own', 'activity_comments_insert_own');
