-- A concierge booking can be requested while a GC is verified, then accepted
-- later. Re-check availability before acceptance so stale requests cannot
-- activate paid concierge work after verification or marketplace access changes.

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
    SELECT (verified IS TRUE AND concierge_enabled IS TRUE)
      INTO v_gc_available
      FROM public.general_contractors
     WHERE id = v_booking.general_contractor_id;

    IF v_gc_available IS NOT TRUE THEN
      RAISE EXCEPTION 'Only verified concierge-enabled GCs can accept concierge bookings';
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

REVOKE ALL ON FUNCTION public.respond_to_gc_concierge_booking(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_gc_concierge_booking(UUID, TEXT, TEXT) TO authenticated;
