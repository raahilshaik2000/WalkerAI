-- ============================================================
-- 20260625000000_allow_homeowner_change_requests.sql
-- Let homeowners submit their OWN change requests on their projects.
--
-- Dominic's model: homeowners can request changes (materials, finishes, scope,
-- upgrades, additions, removals), which are processed as Change Orders. The
-- homeowner does NOT set the price — WalkerAI / the trade prices it — so a
-- homeowner-submitted change order carries no cost_delta and is not pre-signed
-- by the company. Existing company-side insert/select/update policies are left
-- untouched; this adds an additional INSERT policy (RLS policies are OR'd).
-- ============================================================

CREATE POLICY "change_orders_homeowner_insert" ON public.change_orders
  FOR INSERT WITH CHECK (
    -- The homeowner doesn't price the work and can't sign for the company.
    signed_by_company IS NOT TRUE
    AND cost_delta IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = change_orders.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
  );
