-- Payment draw requests and GC-to-trade negotiations are audit records. After
-- insertion, participants may respond/cancel, but the original request terms
-- must not be rewritten through broad update policies.

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

  IF NEW.status = OLD.status
    AND (
      NEW.response_note IS DISTINCT FROM OLD.response_note
      OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
      OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    )
  THEN
    RAISE EXCEPTION 'GC payment request response details require a status change';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_payment_request_updates_trigger ON public.gc_payment_requests;
CREATE TRIGGER guard_gc_payment_request_updates_trigger
  BEFORE UPDATE ON public.gc_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_payment_request_updates();

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

  IF NEW.status = OLD.status
    AND (
      NEW.company_response_note IS DISTINCT FROM OLD.company_response_note
      OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
      OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    )
  THEN
    RAISE EXCEPTION 'GC trade negotiation response details require a status change';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_trade_negotiation_updates_trigger ON public.gc_trade_quote_negotiations;
CREATE TRIGGER guard_gc_trade_negotiation_updates_trigger
  BEFORE UPDATE ON public.gc_trade_quote_negotiations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_trade_negotiation_updates();

REVOKE ALL ON FUNCTION public.guard_gc_payment_request_updates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_gc_trade_negotiation_updates() FROM PUBLIC, anon, authenticated;
