-- Allow assigned contractors to review the homeowner after project completion.
-- The existing homeowner review policy covers homeowner -> contractor reviews;
-- this closes the completion notification path for contractor -> homeowner.

DROP POLICY IF EXISTS "reviews_company_insert_project_homeowner" ON public.reviews;

CREATE POLICY "reviews_company_insert_project_homeowner" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.user_id = (SELECT auth.uid())
      WHERE p.id = reviews.project_id
        AND p.homeowner_id = reviews.reviewee_id
        AND p.status = 'completed'
        AND (
          p.assigned_company_id = c.id
          OR EXISTS (
            SELECT 1
            FROM public.project_slots ps
            WHERE ps.project_id = p.id
              AND ps.assigned_company_id = c.id
              AND ps.status IN ('filled', 'scheduled')
          )
          OR EXISTS (
            SELECT 1
            FROM public.quotes q
            WHERE q.project_id = p.id
              AND q.company_id = c.id
              AND q.status = 'approved'
          )
        )
    )
  );
