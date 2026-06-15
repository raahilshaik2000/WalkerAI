-- Apply approved GC trade recommendations for unassigned slots by recording
-- the subcontractor as externally managed. Existing WalkerAI-assigned trades
-- are not silently removed; those remain a separate operational change.

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
  v_material_id UUID;
  v_product_name TEXT;
  v_supplier_name TEXT;
  v_color_finish TEXT;
  v_quote_note TEXT;
  v_trade_slot public.project_slots%ROWTYPE;
  v_recommended_trade_name TEXT;
  v_recommended_company TEXT;
  v_recommended_contact TEXT;
  v_recommendation_note TEXT;
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

  IF p_status = 'approved' AND v_request.request_type = 'material_substitution' THEN
    v_material_id := NULLIF(v_request.metadata->>'material_id', '')::UUID;
    v_product_name := NULLIF(trim(COALESCE(v_request.metadata->>'product_name', '')), '');
    v_supplier_name := NULLIF(trim(COALESCE(v_request.metadata->>'supplier_name', '')), '');
    v_color_finish := NULLIF(trim(COALESCE(v_request.metadata->>'color_finish', '')), '');
    v_quote_note := NULLIF(trim(COALESCE(v_request.metadata->>'quote_note', '')), '');

    IF v_material_id IS NULL OR v_product_name IS NULL THEN
      RAISE EXCEPTION 'Material substitution approval request is missing material or product metadata';
    END IF;

    UPDATE public.materials
       SET specific_model = v_product_name,
           brand_preference = COALESCE(v_supplier_name, brand_preference),
           color_finish = COALESCE(v_color_finish, color_finish),
           contractor_notes = concat_ws(
             E'\n',
             NULLIF(contractor_notes, ''),
             concat('GC approved substitution: ', v_product_name),
             CASE WHEN v_supplier_name IS NOT NULL THEN concat('Supplier/quote: ', v_supplier_name) END,
             v_quote_note
           )
     WHERE id = v_material_id
       AND project_id = v_request.project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Material not found for this project';
    END IF;
  END IF;

  IF p_status = 'approved' AND v_request.request_type = 'trade_substitution' THEN
    v_slot_id := NULLIF(v_request.metadata->>'slot_id', '')::UUID;
    v_recommended_trade_name := NULLIF(trim(COALESCE(v_request.metadata->>'recommended_trade_name', '')), '');
    v_recommended_company := NULLIF(trim(COALESCE(v_request.metadata->>'recommended_company', '')), '');
    v_recommended_contact := NULLIF(trim(COALESCE(v_request.metadata->>'recommended_contact', '')), '');
    v_recommendation_note := NULLIF(trim(COALESCE(v_request.metadata->>'recommendation_note', '')), '');

    IF v_slot_id IS NULL THEN
      RAISE EXCEPTION 'Trade substitution approval request is missing slot metadata';
    END IF;

    SELECT *
      INTO v_trade_slot
      FROM public.project_slots
     WHERE id = v_slot_id
       AND project_id = v_request.project_id
     FOR UPDATE;

    IF v_trade_slot.id IS NULL THEN
      RAISE EXCEPTION 'Trade slot not found for this project';
    END IF;

    IF v_trade_slot.assigned_company_id IS NULL
       AND COALESCE(v_recommended_trade_name, v_recommended_company) IS NOT NULL THEN
      UPDATE public.project_slots
         SET fulfillment_type = 'external',
             external_trade_name = COALESCE(v_recommended_trade_name, v_recommended_company),
             external_trade_company = v_recommended_company,
             external_trade_email = CASE WHEN v_recommended_contact LIKE '%@%' THEN lower(v_recommended_contact) ELSE NULL END,
             external_trade_phone = CASE WHEN v_recommended_contact IS NOT NULL AND v_recommended_contact NOT LIKE '%@%' THEN v_recommended_contact ELSE NULL END,
             external_trade_verification_status = 'unverified',
             external_trade_notes = concat_ws(
               E'\n',
               v_recommendation_note,
               'Homeowner approved GC trade recommendation. Unverified external trade; no WalkerAI escrow protection.'
             ),
             externally_managed_by_gc_id = v_request.requested_by_gc_id,
             externally_managed_at = NOW(),
             status = 'filled'
       WHERE id = v_slot_id
         AND project_id = v_request.project_id
         AND assigned_company_id IS NULL;
    END IF;
  END IF;

  IF p_status = 'approved'
     AND v_request.request_type = 'general_recommendation'
     AND v_request.metadata->>'action' = 'complete_project' THEN
    UPDATE public.projects
       SET status = 'completed'
     WHERE id = v_request.project_id
       AND homeowner_id = v_request.homeowner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Project not found for completion approval';
    END IF;

    UPDATE public.general_contractor_projects
       SET status = 'completed',
           updated_at = NOW()
     WHERE project_id = v_request.project_id
       AND general_contractor_id = v_request.requested_by_gc_id
       AND homeowner_id = v_request.homeowner_id
       AND status = 'active';
  END IF;

  RETURN p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_project_approval_request(UUID, TEXT, TEXT) TO authenticated;
