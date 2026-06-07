-- Reviews should only be created by the homeowner for contractors who actually
-- participated in the reviewed project. Earlier policies only checked that the
-- reviewer was the current user.

DROP POLICY IF EXISTS "reviewers_insert" ON public.reviews;
DROP POLICY IF EXISTS "reviews_reviewer" ON public.reviews;

CREATE POLICY "reviews_homeowner_insert_project_contractor" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = reviews.project_id
        AND p.homeowner_id = (SELECT auth.uid())
        AND EXISTS (
          SELECT 1
          FROM public.companies c
          WHERE c.user_id = reviews.reviewee_id
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
    )
  );

CREATE POLICY "reviews_reviewer_update_own" ON public.reviews
  FOR UPDATE TO authenticated
  USING (reviewer_id = (SELECT auth.uid()))
  WITH CHECK (reviewer_id = (SELECT auth.uid()));

CREATE POLICY "reviews_reviewer_delete_own" ON public.reviews
  FOR DELETE TO authenticated
  USING (reviewer_id = (SELECT auth.uid()));
