-- Enforce blocks in group chat too — previously only DMs, activity comments,
-- posts, and RSVPs checked `blocks` (see migration-enforce-blocks-everywhere.sql),
-- leaving group messages as the one interaction type a blocked pair could
-- still be forced to see each other in, if both remain members of a shared
-- group. Mirrors the DM approach: filtered on the read side only (you simply
-- don't see their messages), not blocked on insert — a group has other
-- members who haven't blocked anyone, and their view of the chat shouldn't
-- be affected by someone else's block. group_messages_select_admin (separate
-- policy, OR'd in) still lets admins see everything for moderation
-- regardless of blocks.
drop policy if exists "group_messages_select" on group_messages;
create policy "group_messages_select" on group_messages for select using (
  is_group_member(group_id, auth.uid())
  and not exists (
    select 1 from blocks
    where (blocker_id = author_id and blocked_id = auth.uid())
       or (blocker_id = auth.uid() and blocked_id = author_id)
  )
);
