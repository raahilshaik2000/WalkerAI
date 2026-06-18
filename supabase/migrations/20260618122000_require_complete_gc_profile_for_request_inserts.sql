-- GC-originated workflow requests should only be created by a current
-- general_contractor account with complete verified setup. Approval-time
-- guards already re-check this; these policies stop new stale/incomplete
-- requests from entering the workflow.

DROP POLICY IF EXISTS "approval_requests_gc_insert" ON public.project_approval_requests;
CREATE POLICY "approval_requests_gc_insert" ON public.project_approval_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = project_approval_requests.project_id
       AND gcp.homeowner_id = project_approval_requests.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = project_approval_requests.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "gc_payment_requests_gc_insert" ON public.gc_payment_requests;
CREATE POLICY "gc_payment_requests_gc_insert" ON public.gc_payment_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_payment_requests.project_id
       AND gcp.homeowner_id = gc_payment_requests.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = gc_payment_requests.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "gc_trade_negotiations_gc_insert" ON public.gc_trade_quote_negotiations;
CREATE POLICY "gc_trade_negotiations_gc_insert" ON public.gc_trade_quote_negotiations
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND NULLIF(TRIM(scope_note), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_trade_quote_negotiations.project_id
       AND gcp.homeowner_id = gc_trade_quote_negotiations.homeowner_id
       AND gcp.status = 'active'
      JOIN public.quotes q
        ON q.id = gc_trade_quote_negotiations.quote_id
       AND q.project_id = gc_trade_quote_negotiations.project_id
       AND q.company_id = gc_trade_quote_negotiations.company_id
       AND q.status = 'pending'
       AND q.stripe_payment_intent_id IS NULL
      WHERE gc.id = gc_trade_quote_negotiations.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
    AND (
      gc_trade_quote_negotiations.slot_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.project_slots ps
        WHERE ps.id = gc_trade_quote_negotiations.slot_id
          AND ps.project_id = gc_trade_quote_negotiations.project_id
          AND ps.assigned_company_id = gc_trade_quote_negotiations.company_id
      )
    )
  );
