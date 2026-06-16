-- Completed GC assignments still need read-only quote and milestone context
-- for the digital project binder after homeowner-approved closeout.

DROP POLICY IF EXISTS "quotes_select_participants" ON public.quotes;
CREATE POLICY "quotes_select_participants" ON public.quotes
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = quotes.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = quotes.company_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = quotes.project_id
       AND gcp.status IN ('active', 'completed')
      WHERE gc.user_id = (SELECT auth.uid())
    )
  );
