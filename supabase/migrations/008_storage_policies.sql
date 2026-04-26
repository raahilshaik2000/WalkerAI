-- Storage RLS policies for upload access.
-- public buckets need explicit INSERT policies — bucket.public=true only covers reads.

CREATE POLICY "project_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-photos');

CREATE POLICY "project_photos_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'project-photos');

CREATE POLICY "renders_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'renders');

CREATE POLICY "renders_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'renders');

CREATE POLICY "progress_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'progress-photos');

CREATE POLICY "progress_photos_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'progress-photos');
