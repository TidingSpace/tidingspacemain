-- Run this once in Supabase's SQL Editor against your EXISTING database.
-- Fixes the Critical finding from the security audit: Storage buckets had no
-- server-side file type or size restrictions at all.

-- Buckets already exist from migration-storage.sql, so this UPDATEs them
-- rather than inserting — insert...on conflict do nothing would not touch
-- already-existing rows.
update storage.buckets
set file_size_limit = 10485760,  -- 10MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id in ('avatars', 'activity-covers', 'post-images', 'chat-images');

-- Verify:
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('avatars', 'activity-covers', 'post-images', 'chat-images');
