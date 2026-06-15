-- Concierge consultation requests for the GC marketplace.
-- Pricing is calculated server-side so homeowners cannot submit arbitrary
-- consultation amounts from the client.

CREATE TABLE IF NOT EXISTS public.gc_concierge_bookings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  general_contractor_id      UUID NOT NULL REFERENCES public.general_contractors(id) ON DELETE CASCADE,
  homeowner_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_kind               TEXT NOT NULL CHECK (service_kind IN (
                               'virtual_30',
                               'virtual_60',
                               'site_visit_first_hour',
                               'full_project_concierge'
                             )),
  title                      TEXT NOT NULL,
  duration_minutes           INTEGER,
  price_cents                INTEGER NOT NULL CHECK (price_cents > 0),
  contractor_payout_cents    INTEGER NOT NULL CHECK (contractor_payout_cents >= 0),
  walker_fee_cents           INTEGER NOT NULL CHECK (walker_fee_cents >= 0),
  status                     TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled', 'completed')),
  response_note              TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gc_concierge_bookings_project_idx
  ON public.gc_concierge_bookings(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS gc_concierge_bookings_gc_idx
  ON public.gc_concierge_bookings(general_contractor_id, status, created_at DESC);

ALTER TABLE public.gc_concierge_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_concierge_bookings_select_participants" ON public.gc_concierge_bookings;
CREATE POLICY "gc_concierge_bookings_select_participants" ON public.gc_concierge_bookings
  FOR SELECT USING (
    homeowner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = gc_concierge_bookings.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

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

  SELECT *
  INTO v_gc
  FROM public.general_contractors
  WHERE id = p_general_contractor_id
    AND verified IS TRUE
    AND concierge_enabled IS TRUE;

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

  UPDATE public.gc_concierge_bookings
  SET status = p_status,
      response_note = NULLIF(TRIM(COALESCE(p_response_note, '')), ''),
      responded_at = NOW()
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_gc_concierge_booking(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_gc_concierge_booking(UUID, TEXT, TEXT) TO authenticated;
