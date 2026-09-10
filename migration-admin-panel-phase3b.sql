-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds Featured Activities, Organizer Verification, Internal Admin Notes,
-- and Platform Settings. Also fixes a real pre-existing bug: the
-- activities_update_admin route never accepted status='active', meaning
-- the admin panel's "Unhide" action has never actually worked until now.

-- ---------- Featured Activities ----------
alter table activities add column if not exists featured boolean default false;
alter table activities add column if not exists featured_until timestamptz;
alter table activities add column if not exists featured_reason text;

-- ---------- Organizer Verification ----------
alter table profiles add column if not exists is_verified_organizer boolean default false;

-- ---------- Internal Admin Notes ----------
create table if not exists admin_notes (
  id uuid primary key default uuid_generate_v4(),
  target_type text not null check (target_type in ('user','activity','group','organizer')),
  target_id uuid not null,
  admin_id uuid references profiles(id) on delete set null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists admin_notes_target_idx on admin_notes (target_type, target_id, created_at desc);
alter table admin_notes enable row level security;
drop policy if exists "admin_notes_select_admin" on admin_notes;
create policy "admin_notes_select_admin" on admin_notes for select using (is_admin(auth.uid()));
drop policy if exists "admin_notes_insert_admin" on admin_notes;
create policy "admin_notes_insert_admin" on admin_notes for insert with check (is_admin(auth.uid()));
drop policy if exists "admin_notes_update_admin" on admin_notes;
create policy "admin_notes_update_admin" on admin_notes for update using (is_admin(auth.uid()));
drop policy if exists "admin_notes_delete_admin" on admin_notes;
create policy "admin_notes_delete_admin" on admin_notes for delete using (is_admin(auth.uid()));

-- ---------- Platform Settings ----------
create table if not exists platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now(),
  updated_by uuid references profiles(id) on delete set null
);
alter table platform_settings enable row level security;
drop policy if exists "platform_settings_select_authenticated" on platform_settings;
create policy "platform_settings_select_authenticated" on platform_settings for select using (auth.uid() is not null);
drop policy if exists "platform_settings_upsert_admin" on platform_settings;
create policy "platform_settings_upsert_admin" on platform_settings for insert with check (is_admin(auth.uid()));
drop policy if exists "platform_settings_update_admin" on platform_settings;
create policy "platform_settings_update_admin" on platform_settings for update using (is_admin(auth.uid()));

insert into platform_settings (key, value) values
  ('maintenance_mode', 'false'),
  ('user_registration_enabled', 'true'),
  ('email_verification_required', 'false'),
  ('default_activity_duration_hours', '2'),
  ('default_map_zoom', '12'),
  ('beta_mode', 'true')
on conflict (key) do nothing;

-- Verify:
select key, value from platform_settings order by key;
