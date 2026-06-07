-- iOS can report HEIF separately from HEIC even when users pick from the same
-- photo library. Keep public photo buckets aligned with the upload helper.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id IN ('project-photos', 'avatars');
