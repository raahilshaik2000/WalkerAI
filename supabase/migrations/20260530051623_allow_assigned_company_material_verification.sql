DROP POLICY IF EXISTS "materials_update_assigned_company" ON public.materials;

CREATE POLICY "materials_update_assigned_company" ON public.materials
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = materials.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = materials.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  );
