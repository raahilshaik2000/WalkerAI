-- GC completion binder read access for warranty closeout documents.

DROP POLICY IF EXISTS "warranties_gc_managed_select" ON public.warranties;
CREATE POLICY "warranties_gc_managed_select" ON public.warranties
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = warranties.project_id
        AND gcp.status IN ('invited', 'active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );
