-- Material order claims must go through the claim-material-order edge function.
-- That function verifies the authenticated supplier profile before using this
-- service-role-only RPC to perform the race-safe claim.

REVOKE ALL ON FUNCTION public.atomic_claim_material_order(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.atomic_claim_material_order(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_claim_material_order(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_claim_material_order(uuid, uuid) TO service_role;

-- Homeowners confirm and pay material orders through supplier-payout. Direct
-- homeowner updates were too broad and could change supplier, price, status,
-- payout, or delivery fields from the client.
DROP POLICY IF EXISTS "orders_homeowner_update" ON public.material_orders;
