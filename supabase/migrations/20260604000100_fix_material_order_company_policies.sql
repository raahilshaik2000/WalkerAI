-- Fix company access to material orders for both legacy assigned-company projects
-- and the trade-slot assignment model.

DROP POLICY IF EXISTS "orders_company_read" ON public.material_orders;

CREATE POLICY "orders_company_read" ON public.material_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = material_orders.project_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = material_orders.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "orders_company_update" ON public.material_orders;

CREATE POLICY "orders_company_update" ON public.material_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = material_orders.project_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = material_orders.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = material_orders.project_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = material_orders.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  );
