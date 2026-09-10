-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Fixes: accepting/declining a group invite notification appeared to "not
-- save" — it reverted to showing Accept/Decline again after a reload.
--
-- Root cause: the notifications page tracked "you already responded" only
-- in local React state, which resets to empty on every page load — the API
-- never told the frontend "this one's already been handled." Separately,
-- declining used to DELETE the group_members row entirely, which made
-- "declined" indistinguishable from "never invited" — so even fixing the
-- first issue wouldn't have let a declined invite correctly keep showing
-- "Declined" specifically (as opposed to Accept/Decline again).

alter table group_members drop constraint if exists group_members_status_check;
alter table group_members add constraint group_members_status_check
  check (status in ('active', 'pending', 'declined'));

-- Verify:
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'group_members_status_check';
