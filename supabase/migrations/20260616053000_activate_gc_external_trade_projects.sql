-- A GC-managed project can be run entirely with externally managed trades.
-- In that path no Stripe quote payment occurs, so the normal quote-payment
-- webhook never advances the homeowner project to active. Once every trade
-- slot is externally managed and the homeowner-approved budget exists, mark
-- the project active so closeout can proceed without bypassing escrow rules
-- for WalkerAI-managed trades.

CREATE OR REPLACE FUNCTION public.mark_project_slot_externally_managed(
  p_slot_id UUID,
  p_trade_name TEXT,
  p_trade_company TEXT DEFAULT NULL,
  p_trade_email TEXT DEFAULT NULL,
  p_trade_phone TEXT DEFAULT NULL,
  p_verification_status TEXT DEFAULT 'unverified',
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc public.general_contractors%ROWTYPE;
  v_slot public.project_slots%ROWTYPE;
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT *
    INTO v_gc
    FROM public.general_contractors
   WHERE user_id = (SELECT auth.uid())
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'General contractor profile not found';
  END IF;

  IF v_gc.verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified General Contractors can mark external trades';
  END IF;

  SELECT *
    INTO v_slot
    FROM public.project_slots
   WHERE id = p_slot_id
   FOR UPDATE;

  IF v_slot.id IS NULL THEN
    RAISE EXCEPTION 'Project slot not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.general_contractor_projects gcp
    WHERE gcp.project_id = v_slot.project_id
      AND gcp.general_contractor_id = v_gc.id
      AND gcp.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active GC management is required before marking external trades';
  END IF;

  IF v_slot.assigned_company_id IS NOT NULL THEN
    RAISE EXCEPTION 'WalkerAI-assigned slots cannot be marked externally managed';
  END IF;

  IF trim(COALESCE(p_trade_name, '')) = '' THEN
    RAISE EXCEPTION 'External trade name is required';
  END IF;

  IF p_verification_status NOT IN ('unverified', 'documents_uploaded', 'walker_verified') THEN
    RAISE EXCEPTION 'Invalid external trade verification status';
  END IF;

  UPDATE public.project_slots
     SET fulfillment_type = 'external',
         external_trade_name = trim(p_trade_name),
         external_trade_company = NULLIF(trim(COALESCE(p_trade_company, '')), ''),
         external_trade_email = NULLIF(lower(trim(COALESCE(p_trade_email, ''))), ''),
         external_trade_phone = NULLIF(trim(COALESCE(p_trade_phone, '')), ''),
         external_trade_verification_status = p_verification_status,
         external_trade_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
         externally_managed_by_gc_id = v_gc.id,
         externally_managed_at = NOW(),
         status = 'filled'
   WHERE id = p_slot_id;

  SELECT *
    INTO v_project
    FROM public.projects
   WHERE id = v_slot.project_id
   FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Project not found for external trade';
  END IF;

  IF v_project.status IN ('draft', 'brief_ready', 'dispatching')
     AND v_project.ai_cost_min > 0
     AND v_project.ai_cost_max > 0
     AND NOT EXISTS (
       SELECT 1
         FROM public.project_slots slot
        WHERE slot.project_id = v_project.id
          AND (
            slot.fulfillment_type <> 'external'
            OR slot.status <> 'filled'
          )
     )
  THEN
    UPDATE public.projects
       SET status = 'active',
           dispatch_expires_at = NULL
     WHERE id = v_project.id;
  END IF;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    v_project.homeowner_id,
    'new_message',
    jsonb_build_object(
      'project_id', v_project.id,
      'slot_id', p_slot_id,
      'message', 'A scope was marked externally managed by your General Contractor.'
    )
  );

  RETURN p_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_project_slot_externally_managed(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_project_slot_externally_managed(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
