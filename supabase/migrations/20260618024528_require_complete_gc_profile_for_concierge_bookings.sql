-- Concierge bookings must use the same complete GC trust profile required for
-- marketplace discovery and managed project workflows.

CREATE OR REPLACE FUNCTION public.request_gc_concierge_booking(
  p_project_id UUID,
  p_general_contractor_id UUID,
  p_service_kind TEXT
)
RETURNS public.gc_concierge_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_gc public.general_contractors%ROWTYPE;
  v_title TEXT;
  v_duration INTEGER;
  v_price INTEGER;
  v_contractor_payout INTEGER;
  v_booking public.gc_concierge_bookings%ROWTYPE;
BEGIN
  SELECT *
  INTO v_project
  FROM public.projects
  WHERE id = p_project_id;

  IF v_project.id IS NULL OR v_project.homeowner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Only the project homeowner can request concierge services';
  END IF;

  SELECT gc.*
  INTO v_gc
  FROM public.general_contractors gc
  JOIN public.users u
    ON u.id = gc.user_id
   AND u.role = 'general_contractor'
  WHERE gc.id = p_general_contractor_id
    AND gc.verified IS TRUE
    AND gc.concierge_enabled IS TRUE
    AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
    AND NULLIF(TRIM(gc.city), '') IS NOT NULL
    AND NULLIF(TRIM(gc.province), '') IS NOT NULL
    AND gc.lat IS NOT NULL
    AND gc.lng IS NOT NULL
    AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
    AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
    AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL;

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'This GC is not available for concierge bookings';
  END IF;

  IF p_service_kind = 'virtual_30' THEN
    v_title := '30-minute virtual consultation';
    v_duration := 30;
    v_price := 9900;
  ELSIF p_service_kind = 'virtual_60' THEN
    v_title := '60-minute virtual consultation';
    v_duration := 60;
    v_price := 14900;
  ELSIF p_service_kind = 'site_visit_first_hour' THEN
    v_title := 'Site visit consultation - first hour';
    v_duration := 60;
    v_price := 24900;
  ELSIF p_service_kind = 'full_project_concierge' THEN
    v_title := 'Full project concierge';
    v_duration := NULL;
    v_price := ROUND(
      COALESCE(v_project.ai_cost_max, v_project.ai_cost_min, 0)
      * COALESCE(v_gc.default_concierge_fee_pct, 10)
      / 100
    )::INTEGER;
  ELSE
    RAISE EXCEPTION 'Unsupported concierge service';
  END IF;

  IF v_price <= 0 THEN
    RAISE EXCEPTION 'Project estimate is required before requesting full project concierge';
  END IF;

  v_contractor_payout := ROUND(v_price * 0.80)::INTEGER;

  INSERT INTO public.gc_concierge_bookings (
    project_id,
    general_contractor_id,
    homeowner_id,
    service_kind,
    title,
    duration_minutes,
    price_cents,
    contractor_payout_cents,
    walker_fee_cents
  )
  VALUES (
    p_project_id,
    p_general_contractor_id,
    v_project.homeowner_id,
    p_service_kind,
    v_title,
    v_duration,
    v_price,
    v_contractor_payout,
    v_price - v_contractor_payout
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_gc_concierge_booking(
  p_booking_id UUID,
  p_status TEXT,
  p_response_note TEXT DEFAULT NULL
)
RETURNS public.gc_concierge_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.gc_concierge_bookings%ROWTYPE;
  v_gc_available BOOLEAN;
BEGIN
  IF p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Concierge booking response must be accepted or rejected';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.gc_concierge_bookings
  WHERE id = p_booking_id
    AND status = 'pending'
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Pending concierge booking not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.general_contractors gc
    WHERE gc.id = v_booking.general_contractor_id
      AND gc.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only the requested GC can respond to this booking';
  END IF;

  IF p_status = 'accepted' THEN
    SELECT (
      gc.verified IS TRUE
      AND gc.concierge_enabled IS TRUE
      AND u.role = 'general_contractor'
      AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
      AND NULLIF(TRIM(gc.city), '') IS NOT NULL
      AND NULLIF(TRIM(gc.province), '') IS NOT NULL
      AND gc.lat IS NOT NULL
      AND gc.lng IS NOT NULL
      AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
      AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
      AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
    INTO v_gc_available
    FROM public.general_contractors gc
    JOIN public.users u ON u.id = gc.user_id
    WHERE gc.id = v_booking.general_contractor_id;

    IF v_gc_available IS NOT TRUE THEN
      RAISE EXCEPTION 'Only verified concierge-enabled GCs with complete business, license, and insurance setup can accept concierge bookings';
    END IF;
  END IF;

  UPDATE public.gc_concierge_bookings
  SET status = p_status,
      response_note = NULLIF(TRIM(COALESCE(p_response_note, '')), ''),
      responded_at = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.request_gc_concierge_booking(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_to_gc_concierge_booking(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_gc_concierge_booking(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_gc_concierge_booking(UUID, TEXT, TEXT) TO authenticated;
