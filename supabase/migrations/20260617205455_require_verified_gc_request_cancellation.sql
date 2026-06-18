-- GC-originated request cancellations are project-control actions. Keep them
-- aligned with the app-level locks by requiring the GC profile to remain
-- WalkerAI verified, not only assigned to the project.

DROP POLICY IF EXISTS "approval_requests_gc_cancel" ON public.project_approval_requests;
CREATE POLICY "approval_requests_gc_cancel" ON public.project_approval_requests
  FOR UPDATE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = project_approval_requests.project_id
       AND gcp.homeowner_id = project_approval_requests.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = project_approval_requests.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  )
  WITH CHECK (
    status = 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = project_approval_requests.project_id
       AND gcp.homeowner_id = project_approval_requests.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = project_approval_requests.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  );

DROP POLICY IF EXISTS "gc_payment_requests_gc_cancel" ON public.gc_payment_requests;
CREATE POLICY "gc_payment_requests_gc_cancel" ON public.gc_payment_requests
  FOR UPDATE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_payment_requests.project_id
       AND gcp.homeowner_id = gc_payment_requests.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = gc_payment_requests.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  )
  WITH CHECK (
    status = 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_payment_requests.project_id
       AND gcp.homeowner_id = gc_payment_requests.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = gc_payment_requests.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  );

DROP POLICY IF EXISTS "gc_trade_negotiations_gc_cancel" ON public.gc_trade_quote_negotiations;
CREATE POLICY "gc_trade_negotiations_gc_cancel" ON public.gc_trade_quote_negotiations
  FOR UPDATE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_trade_quote_negotiations.project_id
       AND gcp.homeowner_id = gc_trade_quote_negotiations.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = gc_trade_quote_negotiations.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  )
  WITH CHECK (
    status = 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_trade_quote_negotiations.project_id
       AND gcp.homeowner_id = gc_trade_quote_negotiations.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = gc_trade_quote_negotiations.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  );
