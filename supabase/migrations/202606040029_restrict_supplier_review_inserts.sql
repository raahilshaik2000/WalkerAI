-- Supplier reviews are meant to come from contractors on the project whose
-- material order was fulfilled. Restrict inserts to that relationship before
-- a supplier-review UI is added.

DROP POLICY IF EXISTS "reviews_write" ON public.supplier_reviews;

CREATE POLICY "supplier_reviews_project_contractor_insert" ON public.supplier_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.material_orders mo
      JOIN public.projects p ON p.id = mo.project_id
      JOIN public.companies c ON c.user_id = (SELECT auth.uid())
      WHERE mo.id = supplier_reviews.order_id
        AND mo.accepted_supplier_id = supplier_reviews.supplier_id
        AND mo.status IN ('delivered', 'confirmed', 'paid')
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
