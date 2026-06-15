-- Tighten pending-request status transitions for GC payment requests and
-- GC-to-trade negotiations. The original terms remain immutable, and only the
-- proper participant can move each record out of pending.

CREATE OR REPLACE FUNCTION public.guard_gc_payment_request_updates()
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
    RAISE EXCEPTION 'Payment request has already been responded to';
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.general_contractor_id IS DISTINCT FROM OLD.general_contractor_id
    OR NEW.homeowner_id IS DISTINCT FROM OLD.homeowner_id
    OR NEW.request_kind IS DISTINCT FROM OLD.request_kind
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'GC payment request details cannot be changed after submission';
  END IF;

  IF NEW.status IN ('approved', 'rejected') THEN
    IF NEW.homeowner_id <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Only the homeowner can approve or reject a GC payment request';
    END IF;

    IF NEW.responded_at IS NULL THEN
      RAISE EXCEPTION 'GC payment request responses must include a response timestamp';
    END IF;

    IF NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC payment request responses cannot include cancellation details';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = OLD.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Only the requesting GC can cancel a GC payment request';
    END IF;

    IF NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'GC payment request cancellations must include a cancellation timestamp';
    END IF;

    IF NEW.response_note IS NOT NULL OR NEW.responded_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC payment request cancellations cannot include response details';
    END IF;
  ELSIF NEW.status = 'pending' THEN
    RAISE EXCEPTION 'GC payment request status cannot be reset to pending';
  ELSE
    RAISE EXCEPTION 'Invalid GC payment request status transition';
  END IF;

  RETURN NEW;
END;
$$;

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

REVOKE ALL ON FUNCTION public.guard_gc_payment_request_updates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_gc_trade_negotiation_updates() FROM PUBLIC, anon, authenticated;
