-- Slot-assigned companies need project chat access even when no quote row exists.

DROP POLICY IF EXISTS "messages_project_participants" ON public.messages;

CREATE POLICY "messages_project_participants" ON public.messages
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE homeowner_id = (SELECT auth.uid())
      UNION
      SELECT q.project_id
      FROM public.quotes q
      JOIN public.companies c ON c.id = q.company_id
      WHERE c.user_id = (SELECT auth.uid())
      UNION
      SELECT ps.project_id
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE homeowner_id = (SELECT auth.uid())
      UNION
      SELECT q.project_id
      FROM public.quotes q
      JOIN public.companies c ON c.id = q.company_id
      WHERE c.user_id = (SELECT auth.uid())
      UNION
      SELECT ps.project_id
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE c.user_id = (SELECT auth.uid())
    )
  );
