-- Approved GC discovery change-order requests should become real project
-- change-order records only after the homeowner approves them. The GC still
-- cannot write directly to change_orders from the client.

CREATE OR REPLACE FUNCTION public.enforce_change_order_workflow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_auth_uid UUID;
  v_is_homeowner boolean;
  v_is_company boolean;
BEGIN
  IF TG_OP = 'INSERT'
     AND current_setting('walker.internal_change_order_insert', true) = 'gc_approved_change_order' THEN
    IF NEW.company_id IS NOT NULL THEN
      RAISE EXCEPTION 'GC-approved change orders must not impersonate a company';
    END IF;

    IF NEW.status <> 'approved'
      OR NEW.signed_by_company IS DISTINCT FROM TRUE
      OR NEW.signed_by_homeowner IS DISTINCT FROM TRUE
    THEN
      RAISE EXCEPTION 'GC-approved change orders must be approved and signed by both project parties';
    END IF;

    IF NEW.description IS NULL OR length(trim(NEW.description)) = 0 THEN
      RAISE EXCEPTION 'Change order description is required';
    END IF;

    RETURN NEW;
  END IF;

  v_auth_uid := (SELECT auth.uid());

  -- Service-role edge functions and maintenance paths do not carry an end-user.
  IF v_auth_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Change orders cannot be deleted from the client';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Change orders must be assigned to a contractor company';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = NEW.company_id
        AND c.user_id = v_auth_uid
    )
    INTO v_is_company;

    IF NOT v_is_company THEN
      RAISE EXCEPTION 'Contractors can only create change orders for their own company';
    END IF;

    IF NOT public.is_company_project_participant(NEW.project_id, NEW.company_id) THEN
      RAISE EXCEPTION 'Contractor is not assigned to this project';
    END IF;

    IF NEW.status <> 'proposed'
      OR NEW.signed_by_company IS DISTINCT FROM TRUE
      OR NEW.signed_by_homeowner IS DISTINCT FROM FALSE
    THEN
      RAISE EXCEPTION 'New change orders must be proposed and contractor-signed';
    END IF;

    IF NEW.description IS NULL OR length(trim(NEW.description)) = 0 THEN
      RAISE EXCEPTION 'Change order description is required';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.cost_delta IS DISTINCT FROM OLD.cost_delta
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Change order details cannot be edited after proposal';
  END IF;

  IF OLD.status <> 'proposed' THEN
    RAISE EXCEPTION 'Finalized change orders cannot be changed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = OLD.project_id
      AND p.homeowner_id = v_auth_uid
  )
  INTO v_is_homeowner;

  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = OLD.company_id
      AND c.user_id = v_auth_uid
  )
  INTO v_is_company;

  IF v_is_homeowner THEN
    IF OLD.signed_by_company IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Homeowners can only respond after the contractor signs';
    END IF;

    IF NEW.signed_by_company IS DISTINCT FROM OLD.signed_by_company THEN
      RAISE EXCEPTION 'Homeowners cannot change contractor signatures';
    END IF;

    IF OLD.signed_by_homeowner IS DISTINCT FROM TRUE
      AND NEW.signed_by_homeowner IS TRUE
      AND NEW.status = 'approved'
    THEN
      RETURN NEW;
    END IF;

    IF NEW.signed_by_homeowner IS NOT DISTINCT FROM OLD.signed_by_homeowner
      AND NEW.status = 'rejected'
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Homeowners can only approve/sign or reject contractor-signed change orders';
  END IF;

  IF v_is_company THEN
    IF OLD.signed_by_company IS TRUE THEN
      RAISE EXCEPTION 'Contractor has already signed this change order';
    END IF;

    IF NEW.signed_by_homeowner IS DISTINCT FROM OLD.signed_by_homeowner THEN
      RAISE EXCEPTION 'Contractors cannot change homeowner signatures';
    END IF;

    IF NEW.signed_by_company IS TRUE
      AND (
        (OLD.signed_by_homeowner IS TRUE AND NEW.status = 'approved')
        OR (OLD.signed_by_homeowner IS NOT TRUE AND NEW.status = 'proposed')
      )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Contractors can only sign their own proposed change orders';
  END IF;

  RAISE EXCEPTION 'Change order update is not permitted';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_change_order_from_gc_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_description TEXT;
  v_timeline_days INTEGER;
BEGIN
  IF OLD.status IS DISTINCT FROM 'pending'
     OR NEW.status IS DISTINCT FROM 'approved'
     OR NEW.request_type IS DISTINCT FROM 'change_order'
     OR NEW.metadata->>'source' IS DISTINCT FROM 'gc_discovery' THEN
    RETURN NEW;
  END IF;

  v_timeline_days := NEW.timeline_delta_days;
  v_description := concat_ws(
    E'\n\n',
    NULLIF(trim(NEW.title), ''),
    NULLIF(trim(COALESCE(NEW.description, '')), ''),
    CASE
      WHEN v_timeline_days IS NULL THEN NULL
      ELSE concat(
        'Timeline impact: ',
        CASE WHEN v_timeline_days > 0 THEN '+' ELSE '' END,
        v_timeline_days,
        CASE WHEN abs(v_timeline_days) = 1 THEN ' day' ELSE ' days' END
      )
    END,
    concat('Created from homeowner-approved GC discovery request ', NEW.id, '.')
  );

  PERFORM set_config('walker.internal_change_order_insert', 'gc_approved_change_order', true);

  INSERT INTO public.change_orders (
    project_id,
    company_id,
    description,
    cost_delta,
    status,
    signed_by_homeowner,
    signed_by_company
  )
  VALUES (
    NEW.project_id,
    NULL,
    v_description,
    NEW.cost_delta,
    'approved',
    TRUE,
    TRUE
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_change_order_from_gc_approval_trigger ON public.project_approval_requests;
CREATE TRIGGER create_change_order_from_gc_approval_trigger
  AFTER UPDATE OF status ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.create_change_order_from_gc_approval();

REVOKE ALL ON FUNCTION public.enforce_change_order_workflow() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_change_order_from_gc_approval() FROM PUBLIC, anon, authenticated;
