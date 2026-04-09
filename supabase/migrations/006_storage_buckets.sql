-- Create storage buckets (idempotent).
-- project-photos and renders must be public so <Image> can load URLs
-- without sending auth headers.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('project-photos', 'project-photos', true,  52428800, ARRAY['image/jpeg','image/png','image/webp','image/heic']),
  ('renders',        'renders',        true,  52428800, ARRAY['image/jpeg','image/png','image/webp']),
  ('permits',        'permits',        false, 10485760, NULL),
  ('company-docs',   'company-docs',   false, 10485760, NULL),
  ('progress-photos','progress-photos',true,  52428800, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types= EXCLUDED.allowed_mime_types;
