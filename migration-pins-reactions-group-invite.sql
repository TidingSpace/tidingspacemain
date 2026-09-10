-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Adds: pinned messages (groups + activity chats), message reactions
-- (groups + activity chats), and the ability for a group admin to add
-- someone else to the group.

-- ---------- Pinned messages ----------
alter table activities add column if not exists pinned_message_id uuid;
alter table groups add column if not exists pinned_message_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_pinned_message_fk') then
    alter table activities add constraint activities_pinned_message_fk
      foreign key (pinned_message_id) references activity_messages(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'groups_pinned_message_fk') then
    alter table groups add constraint groups_pinned_message_fk
      foreign key (pinned_message_id) references group_messages(id) on delete set null;
  end if;
end $$;

-- ---------- Reactions ----------
create table if not exists activity_message_reactions (
  message_id uuid not null references activity_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists group_message_reactions (
  message_id uuid not null references group_messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

alter table activity_message_reactions enable row level security;
alter table group_message_reactions enable row level security;

drop policy if exists "activity_message_reactions_select" on activity_message_reactions;
create policy "activity_message_reactions_select" on activity_message_reactions for select using (
  auth.uid() in (
    select organizer_id from activities where activities.id = (
      select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id
    )
  )
  or auth.uid() in (
    select user_id from rsvps
    where rsvps.activity_id = (select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id)
    and rsvps.status in ('confirmed','waitlisted','checked_in')
  )
);

drop policy if exists "activity_message_reactions_insert" on activity_message_reactions;
create policy "activity_message_reactions_insert" on activity_message_reactions for insert with check (
  auth.uid() = user_id and (
    auth.uid() in (
      select organizer_id from activities where activities.id = (
        select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id
      )
    )
    or auth.uid() in (
      select user_id from rsvps
      where rsvps.activity_id = (select activity_id from activity_messages where activity_messages.id = activity_message_reactions.message_id)
      and rsvps.status in ('confirmed','waitlisted','checked_in')
    )
  )
);

drop policy if exists "activity_message_reactions_delete_own" on activity_message_reactions;
create policy "activity_message_reactions_delete_own" on activity_message_reactions for delete using (auth.uid() = user_id);

-- Requires is_group_member() — already created by migration-fix-group-rls-recursion.sql.
-- If you haven't run that migration yet, run it before this one.
drop policy if exists "group_message_reactions_select" on group_message_reactions;
create policy "group_message_reactions_select" on group_message_reactions for select using (
  is_group_member(
    (select group_id from group_messages where group_messages.id = group_message_reactions.message_id),
    auth.uid()
  )
);

drop policy if exists "group_message_reactions_insert" on group_message_reactions;
create policy "group_message_reactions_insert" on group_message_reactions for insert with check (
  auth.uid() = user_id
  and is_group_member(
    (select group_id from group_messages where group_messages.id = group_message_reactions.message_id),
    auth.uid()
  )
);

drop policy if exists "group_message_reactions_delete_own" on group_message_reactions;
create policy "group_message_reactions_delete_own" on group_message_reactions for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table group_message_reactions;
alter publication supabase_realtime add table activity_message_reactions;

-- ---------- View refresh ----------
-- activities_with_availability is "select a.*" — Postgres fixes a view's
-- column list at CREATE VIEW time, so the new pinned_message_id column on
-- activities would otherwise be silently missing from every response
-- through this view (same issue found and fixed twice before in this project).
drop view if exists activities_with_availability;
create view activities_with_availability as
select
  a.*,
  a.capacity - coalesce((
    select count(*) from rsvps r
    where r.activity_id = a.id and r.status = 'confirmed'
  ), 0) as spots_remaining
from activities a;

-- ---------- Adding people to a group ----------
-- No schema change needed here — group_members_insert_admin already existed
-- and already supports this; only the API route and frontend UI are new.

-- Verify:
select column_name from information_schema.columns where table_name = 'activities' and column_name = 'pinned_message_id';
select column_name from information_schema.columns where table_name = 'groups' and column_name = 'pinned_message_id';
select table_name from information_schema.tables where table_name in ('activity_message_reactions', 'group_message_reactions');
