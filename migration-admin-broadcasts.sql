-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds the Broadcast Notifications system: admin_broadcasts table, and a
-- broadcast_id column + admin-only insert policy on notifications so a
-- single broadcast can fan out into many individual notification rows.

create table if not exists admin_broadcasts (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  message text not null,
  notification_type text not null check (notification_type in ('information','announcement','warning','maintenance')),
  audience_type text not null check (audience_type in ('everyone','city','category','organizers','user')),
  audience_value text,
  status text not null default 'draft' check (status in ('draft','scheduled','sent','failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer default 0,
  failure_reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists admin_broadcasts_created_idx on admin_broadcasts (created_at desc);

alter table admin_broadcasts enable row level security;
drop policy if exists "admin_broadcasts_select_admin" on admin_broadcasts;
create policy "admin_broadcasts_select_admin" on admin_broadcasts for select using (is_admin(auth.uid()));
drop policy if exists "admin_broadcasts_insert_admin" on admin_broadcasts;
create policy "admin_broadcasts_insert_admin" on admin_broadcasts for insert with check (is_admin(auth.uid()));
drop policy if exists "admin_broadcasts_update_admin" on admin_broadcasts;
create policy "admin_broadcasts_update_admin" on admin_broadcasts for update using (is_admin(auth.uid()));

alter table notifications add column if not exists broadcast_id uuid references admin_broadcasts(id) on delete cascade;
drop policy if exists "notifications_insert_admin_broadcast" on notifications;
create policy "notifications_insert_admin_broadcast" on notifications for insert with check (
  broadcast_id is not null and is_admin(auth.uid())
);

-- ============================================================
-- NOT INCLUDED, AND STILL REQUIRED FOR FULL FUNCTIONALITY:
--
-- 1. Automatic sending of scheduled broadcasts. A broadcast saved with a
--    future scheduled_at sits with status='scheduled' but nothing checks
--    for and sends it automatically yet. This needs:
--      a) A new API route, e.g. /api/cron/send-scheduled-broadcasts, that
--         queries admin_broadcasts where status='scheduled' and
--         scheduled_at <= now(), then calls the same sendBroadcast() logic
--         already used for manual sends (lib/adminBroadcast.ts).
--      b) A new entry in vercel.json's cron schedule (same pattern as the
--         existing rate-limit-log cleanup cron), running every few minutes.
--    Until that exists, scheduled broadcasts must be sent manually via the
--    "Send Now" button once their time arrives.
--
-- 2. Push notification delivery. Broadcasts currently only create in-app
--    notification rows (visible in the Notifications tab) — there's no
--    push notification infrastructure in this app at all yet (no device
--    token storage, no APNs/FCM integration). Adding real push delivery
--    would need: a device_tokens table linked to profiles, a push
--    provider integration, and calling that provider inside
--    sendBroadcast() alongside the existing in-app notification insert.
--
-- 3. City-based audience targeting. Profiles have no stored city field
--    anywhere in this schema. Sending a broadcast with audience_type='city'
--    will be saved but will fail immediately with a clear reason when sent
--    (see lib/adminBroadcast.ts), rather than silently going to nobody or
--    everybody. Enabling this needs a profiles.city column and a way for
--    users to actually set it (onboarding, settings, or inferred from
--    their most common activity location).
-- ============================================================

-- Verify:
select column_name from information_schema.columns where table_name = 'admin_broadcasts' limit 1;
