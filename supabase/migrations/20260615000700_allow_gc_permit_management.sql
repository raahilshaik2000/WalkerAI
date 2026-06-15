-- GC permit and inspection coordination for managed projects.

DROP POLICY IF EXISTS "permits_gc_managed" ON public.permits;
CREATE POLICY "permits_gc_managed" ON public.permits
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "permits_gc_managed_insert" ON storage.objects;
CREATE POLICY "permits_gc_managed_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "permits_gc_managed_select" ON storage.objects;
CREATE POLICY "permits_gc_managed_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status IN ('invited', 'active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "permits_gc_managed_update" ON storage.objects;
CREATE POLICY "permits_gc_managed_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
    )
  );
