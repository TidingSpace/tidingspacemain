-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- schema.sql was already updated for future fresh installs — this brings
-- your current, already-running database in line with it.

-- 1. The one genuinely necessary schema change: a real photo URL on profiles.
alter table profiles add column if not exists avatar_url text;

-- 2. Storage buckets.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('activity-covers', 'activity-covers', true),
  ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- 3. Storage policies (drop-then-create, since Postgres has no
--    "create policy if not exists" — this makes the script safely re-runnable).
--
--    All three buckets use the SAME ownership rule: path is {user_id}/{filename},
--    and you may only write to your own folder. This is deliberate, not a
--    missed opportunity to scope activity-covers to "only the organizer" —
--    images are uploaded from the Create Activity form BEFORE the activity
--    row exists, so there's no activity_id yet for Storage to check against.
--    The real "is this YOUR activity" check happens at the database level,
--    via the existing activities_insert_own/activities_update_own RLS, when
--    the activity row referencing this URL is actually created or edited.

drop policy if exists "avatars_read_all" on storage.objects;
create policy "avatars_read_all" on storage.objects for select using (bucket_id = 'avatars');

drop policy if exists "activity_covers_read_all" on storage.objects;
create policy "activity_covers_read_all" on storage.objects for select using (bucket_id = 'activity-covers');

drop policy if exists "post_images_read_all" on storage.objects;
create policy "post_images_read_all" on storage.objects for select using (bucket_id = 'post-images');

drop policy if exists "avatars_write_own" on storage.objects;
create policy "avatars_write_own" on storage.objects for insert with check (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update using (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete using (
  bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "activity_covers_write_own" on storage.objects;
create policy "activity_covers_write_own" on storage.objects for insert with check (
  bucket_id = 'activity-covers' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "activity_covers_update_own" on storage.objects;
create policy "activity_covers_update_own" on storage.objects for update using (
  bucket_id = 'activity-covers' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "activity_covers_delete_own" on storage.objects;
create policy "activity_covers_delete_own" on storage.objects for delete using (
  bucket_id = 'activity-covers' and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "post_images_write_own" on storage.objects;
create policy "post_images_write_own" on storage.objects for insert with check (
  bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "post_images_update_own" on storage.objects;
create policy "post_images_update_own" on storage.objects for update using (
  bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "post_images_delete_own" on storage.objects;
create policy "post_images_delete_own" on storage.objects for delete using (
  bucket_id = 'post-images' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Verify:
select id, name, public from storage.buckets where id in ('avatars', 'activity-covers', 'post-images');
select column_name from information_schema.columns where table_name = 'profiles' and column_name = 'avatar_url';
