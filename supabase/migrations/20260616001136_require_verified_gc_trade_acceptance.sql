-- Accepting a GC trade counteroffer can drive a revised quote package. Keep
-- rejection and revision requests available, but require active verified GC
-- management before a company can accept a pending GC negotiation.

CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Trade negotiation has already been responded to';
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.slot_id IS DISTINCT FROM OLD.slot_id
    OR NEW.quote_id IS DISTINCT FROM OLD.quote_id
    OR NEW.general_contractor_id IS DISTINCT FROM OLD.general_contractor_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.homeowner_id IS DISTINCT FROM OLD.homeowner_id
    OR NEW.offer_amount_cents IS DISTINCT FROM OLD.offer_amount_cents
    OR NEW.scope_note IS DISTINCT FROM OLD.scope_note
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'GC trade negotiation details cannot be changed after submission';
  END IF;

  IF NEW.status IN ('accepted', 'rejected', 'revision_requested') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = OLD.company_id
        AND c.user_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Only the quoted company can respond to a GC trade negotiation';
    END IF;

    IF NEW.status = 'accepted'
       AND NOT EXISTS (
         SELECT 1
           FROM public.general_contractor_projects gcp
           JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
          WHERE gcp.project_id = OLD.project_id
            AND gcp.general_contractor_id = OLD.general_contractor_id
            AND gcp.homeowner_id = OLD.homeowner_id
            AND gcp.status = 'active'
            AND gc.verified IS TRUE
       )
    THEN
      RAISE EXCEPTION 'Active verified GC management is required before accepting a GC trade negotiation';
    END IF;

    IF NEW.responded_at IS NULL THEN
      RAISE EXCEPTION 'GC trade negotiation responses must include a response timestamp';
    END IF;

    IF NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC trade negotiation responses cannot include cancellation details';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = OLD.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Only the requesting GC can cancel a GC trade negotiation';
    END IF;

    IF NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'GC trade negotiation cancellations must include a cancellation timestamp';
    END IF;

    IF NEW.company_response_note IS NOT NULL OR NEW.responded_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC trade negotiation cancellations cannot include response details';
    END IF;
  ELSIF NEW.status = 'pending' THEN
    RAISE EXCEPTION 'GC trade negotiation status cannot be reset to pending';
  ELSE
    RAISE EXCEPTION 'Invalid GC trade negotiation status transition';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_gc_trade_negotiation_updates() FROM PUBLIC, anon, authenticated;
