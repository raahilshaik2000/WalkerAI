-- Keep historical project message reads available to invited, active, and
-- completed GC participants, but require current GC verification before a GC
-- can send new messages. Also require users to send as themselves.

DROP POLICY IF EXISTS "messages_project_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_project_participants_select" ON public.messages;
DROP POLICY IF EXISTS "messages_project_participants_insert" ON public.messages;

CREATE POLICY "messages_project_participants_select" ON public.messages
  FOR SELECT TO authenticated
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
      UNION
      SELECT gcp.project_id
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gc.user_id = (SELECT auth.uid())
        AND gcp.status IN ('invited', 'active', 'completed')
    )
  );

CREATE POLICY "messages_project_participants_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND project_id IN (
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
      UNION
      SELECT gcp.project_id
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND gcp.status IN ('invited', 'active')
    )
  );
