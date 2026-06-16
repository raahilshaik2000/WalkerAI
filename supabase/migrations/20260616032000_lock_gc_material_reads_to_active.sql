-- GC material/order data should only be visible once project management is
-- active, or after completion for closeout history. Pending invitations can see
-- project context on GC assignment screens, but not sourcing/order records.

DROP POLICY IF EXISTS "materials_gc_managed_select" ON public.materials;
CREATE POLICY "materials_gc_managed_select" ON public.materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = materials.project_id
        AND gcp.status IN ('active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "material_orders_gc_managed_select" ON public.material_orders;
CREATE POLICY "material_orders_gc_managed_select" ON public.material_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = material_orders.project_id
        AND gcp.status IN ('active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );
