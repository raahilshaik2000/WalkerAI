-- iOS photo picker can return HEIC/HEIF images for supplier delivery proof.
-- Project photos already allow HEIC; progress photos need the same support so
-- the supplier delivered-status transition can upload proof before updating.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'progress-photos';
