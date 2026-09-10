-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds activity_invites — tracks accept/decline status per activity
-- invite, which a plain notification row can't represent on its own.
-- Required for the reworked "Invite People" feature (default followers
-- list, immediate per-click invites, actionable accept/decline in
-- Notifications) to work at all.

create table if not exists activity_invites (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid not null references activities(id) on delete cascade,
  inviter_id uuid not null references profiles(id) on delete cascade,
  invitee_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  responded_at timestamptz,
  unique (activity_id, invitee_id)
);
create index if not exists activity_invites_invitee_idx on activity_invites (invitee_id);
create index if not exists activity_invites_activity_idx on activity_invites (activity_id);

alter table activity_invites enable row level security;
drop policy if exists "activity_invites_select_participant" on activity_invites;
create policy "activity_invites_select_participant" on activity_invites for select using (
  auth.uid() = inviter_id or auth.uid() = invitee_id
);
drop policy if exists "activity_invites_insert_as_inviter" on activity_invites;
create policy "activity_invites_insert_as_inviter" on activity_invites for insert with check (auth.uid() = inviter_id);
drop policy if exists "activity_invites_update_as_invitee" on activity_invites;
create policy "activity_invites_update_as_invitee" on activity_invites for update using (auth.uid() = invitee_id);

-- Verify:
select column_name from information_schema.columns where table_name = 'activity_invites';
