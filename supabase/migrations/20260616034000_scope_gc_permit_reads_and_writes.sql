-- Keep GC permit history visible after closeout, but only allow active verified
-- GCs to create/update permit records or storage objects.

DROP POLICY IF EXISTS "permits_gc_managed" ON public.permits;
DROP POLICY IF EXISTS "permits_gc_managed_select" ON public.permits;
DROP POLICY IF EXISTS "permits_gc_managed_insert_row" ON public.permits;
DROP POLICY IF EXISTS "permits_gc_managed_update_row" ON public.permits;

CREATE POLICY "permits_gc_managed_select" ON public.permits
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = permits.project_id
        AND gcp.status IN ('active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "permits_gc_managed_insert_row" ON public.permits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  );

CREATE POLICY "permits_gc_managed_update_row" ON public.permits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
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
        AND gc.verified IS TRUE
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
        AND gc.verified IS TRUE
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
        AND gcp.status IN ('active', 'completed')
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
        AND gc.verified IS TRUE
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
        AND gc.verified IS TRUE
    )
  );
