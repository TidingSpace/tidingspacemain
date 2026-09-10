-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- schema.sql was already updated for future fresh installs — this brings
-- your current, already-running database in line with it.

-- 1. Add image_url to all three message tables. text stays NOT NULL (an
--    empty string '' is allowed for image-only messages with no caption).
alter table direct_messages add column if not exists image_url text;
alter table activity_messages add column if not exists image_url text;
alter table group_messages add column if not exists image_url text;

-- 2. New Storage bucket for chat images.
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

-- 3. Storage policies — same uploader-scoped pattern as avatars/activity-covers/post-images.
drop policy if exists "chat_images_read_all" on storage.objects;
create policy "chat_images_read_all" on storage.objects for select using (bucket_id = 'chat-images');

drop policy if exists "chat_images_write_own" on storage.objects;
create policy "chat_images_write_own" on storage.objects for insert with check (
  bucket_id = 'chat-images' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "chat_images_update_own" on storage.objects;
create policy "chat_images_update_own" on storage.objects for update using (
  bucket_id = 'chat-images' and auth.uid()::text = (storage.foldername(name))[1]
);
drop policy if exists "chat_images_delete_own" on storage.objects;
create policy "chat_images_delete_own" on storage.objects for delete using (
  bucket_id = 'chat-images' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Verify:
select column_name from information_schema.columns where table_name = 'direct_messages' and column_name = 'image_url';
select column_name from information_schema.columns where table_name = 'activity_messages' and column_name = 'image_url';
select column_name from information_schema.columns where table_name = 'group_messages' and column_name = 'image_url';
select id, name, public from storage.buckets where id = 'chat-images';
