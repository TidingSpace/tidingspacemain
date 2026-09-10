-- Run this once in Supabase's SQL Editor against your EXISTING database.
--
-- Adds the 'sending' status to admin_broadcasts, used as an atomic claim
-- so the new scheduled-broadcasts cron can't send the same broadcast
-- twice if two runs ever overlap.

alter table admin_broadcasts drop constraint if exists admin_broadcasts_status_check;
alter table admin_broadcasts add constraint admin_broadcasts_status_check
  check (status in ('draft','scheduled','sending','sent','failed'));

-- Verify:
select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'admin_broadcasts_status_check';
