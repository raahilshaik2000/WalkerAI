-- GC request records must begin as pending requests. The homeowner/company
-- response fields are only written through response workflows after creation.

CREATE OR REPLACE FUNCTION public.guard_project_approval_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'pending'
    OR NEW.response_note IS NOT NULL
    OR NEW.responded_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'GC approval requests must start pending without response details';
  END IF;

  IF NULLIF(TRIM(NEW.title), '') IS NULL THEN
    RAISE EXCEPTION 'GC approval request title is required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_approval_request_insert_trigger ON public.project_approval_requests;
CREATE TRIGGER guard_project_approval_request_insert_trigger
  BEFORE INSERT ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_approval_request_insert();

CREATE OR REPLACE FUNCTION public.guard_gc_payment_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'pending'
    OR NEW.response_note IS NOT NULL
    OR NEW.responded_at IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'GC payment requests must start pending without response details';
  END IF;

  IF NULLIF(TRIM(NEW.title), '') IS NULL THEN
    RAISE EXCEPTION 'GC payment request title is required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_payment_request_insert_trigger ON public.gc_payment_requests;
CREATE TRIGGER guard_gc_payment_request_insert_trigger
  BEFORE INSERT ON public.gc_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_payment_request_insert();

CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'pending'
    OR NEW.company_response_note IS NOT NULL
    OR NEW.responded_at IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'GC trade negotiations must start pending without response details';
  END IF;

  IF NULLIF(TRIM(NEW.scope_note), '') IS NULL THEN
    RAISE EXCEPTION 'GC trade negotiation scope note is required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_trade_negotiation_insert_trigger ON public.gc_trade_quote_negotiations;
CREATE TRIGGER guard_gc_trade_negotiation_insert_trigger
  BEFORE INSERT ON public.gc_trade_quote_negotiations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_trade_negotiation_insert();

REVOKE ALL ON FUNCTION public.guard_project_approval_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_gc_payment_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_gc_trade_negotiation_insert() FROM PUBLIC, anon, authenticated;
