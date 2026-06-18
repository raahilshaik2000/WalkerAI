-- GC trade negotiations can lead a company into building a revised quote.
-- Once a quote has a Stripe payment intent, pricing changes belong in change
-- orders instead of negotiation/requote flows.

DROP POLICY IF EXISTS "gc_trade_negotiations_gc_insert" ON public.gc_trade_quote_negotiations;
CREATE POLICY "gc_trade_negotiations_gc_insert" ON public.gc_trade_quote_negotiations
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND NULLIF(TRIM(scope_note), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
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
