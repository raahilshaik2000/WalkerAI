-- GC payment draw requests. These record homeowner authorization for a
-- requested deposit/progress/final draw without bypassing the existing
-- Stripe-funded quote and milestone escrow release path.

CREATE TABLE IF NOT EXISTS public.gc_payment_requests (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  general_contractor_id      UUID NOT NULL REFERENCES public.general_contractors(id) ON DELETE CASCADE,
  homeowner_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_kind               TEXT NOT NULL CHECK (request_kind IN ('deposit', 'progress_draw', 'final_payment')),
  title                      TEXT NOT NULL,
  description                TEXT,
  amount_cents               INTEGER NOT NULL CHECK (amount_cents > 0),
  status                     TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  response_note              TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at               TIMESTAMPTZ,
  cancelled_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gc_payment_requests_project_idx
  ON public.gc_payment_requests(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS gc_payment_requests_gc_idx
  ON public.gc_payment_requests(general_contractor_id, status, created_at DESC);

ALTER TABLE public.gc_payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_payment_requests_select_participants" ON public.gc_payment_requests;
CREATE POLICY "gc_payment_requests_select_participants" ON public.gc_payment_requests
  FOR SELECT USING (
    homeowner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = gc_payment_requests.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "gc_payment_requests_gc_insert" ON public.gc_payment_requests;
CREATE POLICY "gc_payment_requests_gc_insert" ON public.gc_payment_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_payment_requests.project_id
       AND gcp.homeowner_id = gc_payment_requests.homeowner_id
       AND gcp.status = 'active'
      WHERE gc.id = gc_payment_requests.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "gc_payment_requests_gc_cancel" ON public.gc_payment_requests;
CREATE POLICY "gc_payment_requests_gc_cancel" ON public.gc_payment_requests
  FOR UPDATE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = gc_payment_requests.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status = 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = gc_payment_requests.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.respond_to_gc_payment_request(
  p_request_id UUID,
  p_status TEXT,
  p_response_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.gc_payment_requests%ROWTYPE;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Payment request response must be approved or rejected';
  END IF;

  SELECT *
    INTO v_request
    FROM public.gc_payment_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Payment request not found';
  END IF;

  IF v_request.homeowner_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Only the homeowner can respond to this payment request';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment request has already been responded to';
  END IF;

  UPDATE public.gc_payment_requests
     SET status = p_status,
         response_note = NULLIF(trim(COALESCE(p_response_note, '')), ''),
         responded_at = NOW()
   WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_gc_payment_request(UUID, TEXT, TEXT) TO authenticated;
