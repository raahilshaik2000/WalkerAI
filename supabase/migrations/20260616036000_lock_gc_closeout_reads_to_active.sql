-- Warranty and change-order closeout records are project history for active or
-- completed GC assignments, not pre-confirmation invitation context.

DROP POLICY IF EXISTS "warranties_gc_managed_select" ON public.warranties;
CREATE POLICY "warranties_gc_managed_select" ON public.warranties
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = warranties.project_id
        AND gcp.status IN ('active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "change_orders_gc_managed_read" ON public.change_orders;
CREATE POLICY "change_orders_gc_managed_read" ON public.change_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = change_orders.project_id
        AND gcp.status IN ('active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );
