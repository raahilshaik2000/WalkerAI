-- Metadata-backed approval responses. This keeps homeowner approval as the
-- authority and lets specific request types apply controlled project updates.

ALTER TABLE public.project_approval_requests
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.respond_to_project_approval_request(
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
  v_request public.project_approval_requests%ROWTYPE;
  v_slot_id UUID;
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Approval response must be approved or rejected';
  END IF;

  SELECT *
    INTO v_request
    FROM public.project_approval_requests
   WHERE id = p_request_id
   FOR UPDATE;

  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;

  IF v_request.homeowner_id <> (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Only the homeowner can respond to this approval request';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval request has already been responded to';
  END IF;

  UPDATE public.project_approval_requests
     SET status = p_status,
         response_note = NULLIF(trim(COALESCE(p_response_note, '')), ''),
         responded_at = NOW()
   WHERE id = p_request_id;

  IF p_status = 'approved' AND v_request.request_type = 'schedule_change' THEN
    v_slot_id := NULLIF(v_request.metadata->>'slot_id', '')::UUID;
    v_start_date := NULLIF(v_request.metadata->>'scheduled_start_date', '')::DATE;
    v_end_date := NULLIF(v_request.metadata->>'scheduled_end_date', '')::DATE;

    IF v_slot_id IS NULL OR v_start_date IS NULL THEN
      RAISE EXCEPTION 'Schedule approval request is missing slot or start date metadata';
    END IF;

    IF v_end_date IS NOT NULL AND v_end_date < v_start_date THEN
      RAISE EXCEPTION 'Schedule end date cannot be before start date';
    END IF;

    UPDATE public.project_slots
       SET scheduled_start_date = v_start_date,
           scheduled_end_date = v_end_date,
           status = CASE
             WHEN status IN ('filled', 'scheduled') THEN 'scheduled'
             ELSE status
           END
     WHERE id = v_slot_id
       AND project_id = v_request.project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Schedule slot not found for this project';
    END IF;
  END IF;

  RETURN p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_project_approval_request(UUID, TEXT, TEXT) TO authenticated;
