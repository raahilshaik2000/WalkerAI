-- Notifications for the GC approval, payment, and concierge workflows.
-- These are trigger-based so RPC responses and direct table inserts produce
-- the same user-visible notification behavior.

CREATE OR REPLACE FUNCTION public.insert_gc_workflow_notification(
  p_user_id UUID,
  p_type TEXT,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (p_user_id, p_type, COALESCE(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_gc_approval_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_name TEXT;
BEGIN
  SELECT business_name
    INTO v_gc_name
    FROM public.general_contractors
   WHERE id = NEW.requested_by_gc_id;

  PERFORM public.insert_gc_workflow_notification(
    NEW.homeowner_id,
    'gc_approval_requested',
    jsonb_build_object(
      'project_id', NEW.project_id,
      'approval_request_id', NEW.id,
      'request_type', NEW.request_type,
      'title', NEW.title,
      'general_contractor_id', NEW.requested_by_gc_id,
      'general_contractor_name', v_gc_name
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_gc_approval_request_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_user_id UUID;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status = 'pending'
     AND NEW.status IN ('approved', 'rejected') THEN
    SELECT user_id
      INTO v_gc_user_id
      FROM public.general_contractors
     WHERE id = NEW.requested_by_gc_id;

    PERFORM public.insert_gc_workflow_notification(
      v_gc_user_id,
      'gc_approval_responded',
      jsonb_build_object(
        'project_id', NEW.project_id,
        'approval_request_id', NEW.id,
        'request_type', NEW.request_type,
        'title', NEW.title,
        'status', NEW.status
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gc_approval_request_insert_notification ON public.project_approval_requests;
CREATE TRIGGER gc_approval_request_insert_notification
  AFTER INSERT ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_approval_request_insert();

DROP TRIGGER IF EXISTS gc_approval_request_response_notification ON public.project_approval_requests;
CREATE TRIGGER gc_approval_request_response_notification
  AFTER UPDATE OF status ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_approval_request_response();

CREATE OR REPLACE FUNCTION public.notify_gc_payment_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_name TEXT;
BEGIN
  SELECT business_name
    INTO v_gc_name
    FROM public.general_contractors
   WHERE id = NEW.general_contractor_id;

  PERFORM public.insert_gc_workflow_notification(
    NEW.homeowner_id,
    'gc_payment_requested',
    jsonb_build_object(
      'project_id', NEW.project_id,
      'payment_request_id', NEW.id,
      'request_kind', NEW.request_kind,
      'title', NEW.title,
      'amount_cents', NEW.amount_cents,
      'general_contractor_id', NEW.general_contractor_id,
      'general_contractor_name', v_gc_name
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_gc_payment_request_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_user_id UUID;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status = 'pending'
     AND NEW.status IN ('approved', 'rejected') THEN
    SELECT user_id
      INTO v_gc_user_id
      FROM public.general_contractors
     WHERE id = NEW.general_contractor_id;

    PERFORM public.insert_gc_workflow_notification(
      v_gc_user_id,
      'gc_payment_responded',
      jsonb_build_object(
        'project_id', NEW.project_id,
        'payment_request_id', NEW.id,
        'request_kind', NEW.request_kind,
        'title', NEW.title,
        'amount_cents', NEW.amount_cents,
        'status', NEW.status
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gc_payment_request_insert_notification ON public.gc_payment_requests;
CREATE TRIGGER gc_payment_request_insert_notification
  AFTER INSERT ON public.gc_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_payment_request_insert();

DROP TRIGGER IF EXISTS gc_payment_request_response_notification ON public.gc_payment_requests;
CREATE TRIGGER gc_payment_request_response_notification
  AFTER UPDATE OF status ON public.gc_payment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_payment_request_response();

CREATE OR REPLACE FUNCTION public.notify_gc_concierge_booking_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_user_id UUID;
BEGIN
  SELECT user_id
    INTO v_gc_user_id
    FROM public.general_contractors
   WHERE id = NEW.general_contractor_id;

  PERFORM public.insert_gc_workflow_notification(
    v_gc_user_id,
    'gc_concierge_booking_requested',
    jsonb_build_object(
      'project_id', NEW.project_id,
      'concierge_booking_id', NEW.id,
      'service_kind', NEW.service_kind,
      'title', NEW.title,
      'price_cents', NEW.price_cents,
      'homeowner_id', NEW.homeowner_id
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_gc_concierge_booking_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_name TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status = 'pending'
     AND NEW.status IN ('accepted', 'rejected') THEN
    SELECT business_name
      INTO v_gc_name
      FROM public.general_contractors
     WHERE id = NEW.general_contractor_id;

    PERFORM public.insert_gc_workflow_notification(
      NEW.homeowner_id,
      'gc_concierge_booking_responded',
      jsonb_build_object(
        'project_id', NEW.project_id,
        'concierge_booking_id', NEW.id,
        'service_kind', NEW.service_kind,
        'title', NEW.title,
        'price_cents', NEW.price_cents,
        'status', NEW.status,
        'general_contractor_id', NEW.general_contractor_id,
        'general_contractor_name', v_gc_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gc_concierge_booking_insert_notification ON public.gc_concierge_bookings;
CREATE TRIGGER gc_concierge_booking_insert_notification
  AFTER INSERT ON public.gc_concierge_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_concierge_booking_insert();

DROP TRIGGER IF EXISTS gc_concierge_booking_response_notification ON public.gc_concierge_bookings;
CREATE TRIGGER gc_concierge_booking_response_notification
  AFTER UPDATE OF status ON public.gc_concierge_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_concierge_booking_response();

REVOKE ALL ON FUNCTION public.insert_gc_workflow_notification(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_approval_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_approval_request_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_payment_request_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_payment_request_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_concierge_booking_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_concierge_booking_response() FROM PUBLIC, anon, authenticated;
