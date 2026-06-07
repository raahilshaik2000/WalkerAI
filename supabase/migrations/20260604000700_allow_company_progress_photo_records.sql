-- Allow dispatched or assigned companies/trades to record project progress photos.
-- Storage upload was already allowed; this permits the database row homeowners read.

DROP POLICY IF EXISTS "project_photos_company_insert" ON public.project_photos;

CREATE POLICY "project_photos_company_insert" ON public.project_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.dispatch_logs dl
      JOIN public.companies c ON c.id = dl.company_id
      WHERE dl.project_id = project_photos.project_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = project_photos.project_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = project_photos.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  );
