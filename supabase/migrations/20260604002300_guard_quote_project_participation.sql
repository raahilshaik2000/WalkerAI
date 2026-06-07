-- Restrict quote creation to contractors that actually accepted the project or
-- one of its trade slots. A contractor owning a company row is not enough.

CREATE OR REPLACE FUNCTION public.is_company_assigned_to_project(
  p_project_id UUID,
  p_company_id UUID
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.assigned_company_id = p_company_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_slots ps
    WHERE ps.project_id = p_project_id
      AND ps.assigned_company_id = p_company_id
      AND ps.status IN ('filled', 'scheduled')
  )
  OR EXISTS (
    SELECT 1
    FROM public.dispatch_logs dl
    WHERE dl.project_id = p_project_id
      AND dl.company_id = p_company_id
      AND dl.response = 'accepted'
  )
  OR EXISTS (
    SELECT 1
    FROM public.dispatch_logs dl
    JOIN public.project_slots ps ON ps.id = dl.slot_id
    WHERE ps.project_id = p_project_id
      AND dl.company_id = p_company_id
      AND dl.response = 'accepted'
  );
$$;

DROP POLICY IF EXISTS "quotes_homeowner" ON public.quotes;
DROP POLICY IF EXISTS "quotes_homeowner_approve" ON public.quotes;
DROP POLICY IF EXISTS "quotes_company" ON public.quotes;
DROP POLICY IF EXISTS "quotes_participants" ON public.quotes;
DROP POLICY IF EXISTS "quotes_select_participants" ON public.quotes;
DROP POLICY IF EXISTS "quotes_company_insert_assigned" ON public.quotes;
DROP POLICY IF EXISTS "quotes_company_delete_pending" ON public.quotes;

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
  );

CREATE POLICY "quotes_company_insert_assigned" ON public.quotes
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND approved_at IS NULL
    AND total_amount > 0
    AND EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = quotes.company_id
        AND c.user_id = (SELECT auth.uid())
    )
    AND public.is_company_assigned_to_project(project_id, company_id)
  );

CREATE POLICY "quotes_company_delete_pending" ON public.quotes
  FOR DELETE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = quotes.company_id
        AND c.user_id = (SELECT auth.uid())
    )
    AND public.is_company_assigned_to_project(project_id, company_id)
  );
