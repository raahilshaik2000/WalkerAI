-- Homeowner-approved GC trade substitutions can replace an assigned WalkerAI
-- trade only while the slot is still unfunded. Funded/approved quotes stay
-- protected because escrow, milestone, and dispute state need an operational
-- closeout path before a contractor can be removed.

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
  v_markup_pct NUMERIC;
  v_concierge_fee_pct NUMERIC;
  v_budget_min INTEGER;
  v_budget_max INTEGER;
  v_has_protected_quote BOOLEAN;
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

    IF COALESCE(v_recommended_trade_name, v_recommended_company) IS NULL THEN
      RAISE EXCEPTION 'Trade substitution approval request is missing replacement trade metadata';
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

    IF v_trade_slot.assigned_company_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.quotes q
         WHERE q.project_id = v_request.project_id
           AND q.slot_id = v_slot_id
           AND q.company_id = v_trade_slot.assigned_company_id
           AND q.status = 'approved'
      )
      INTO v_has_protected_quote;

      IF v_has_protected_quote THEN
        RAISE EXCEPTION 'This WalkerAI trade has a funded quote. Resolve escrow and milestones before replacing the trade';
      END IF;

      UPDATE public.quotes
         SET status = 'rejected'
       WHERE project_id = v_request.project_id
         AND slot_id = v_slot_id
         AND company_id = v_trade_slot.assigned_company_id
         AND status = 'pending';

      UPDATE public.gc_trade_quote_negotiations
         SET status = 'cancelled',
             cancelled_at = NOW()
       WHERE project_id = v_request.project_id
         AND slot_id = v_slot_id
         AND company_id = v_trade_slot.assigned_company_id
         AND status = 'pending';

      UPDATE public.dispatch_logs
         SET response = 'filled',
             responded_at = COALESCE(responded_at, NOW())
       WHERE slot_id = v_slot_id
         AND company_id = v_trade_slot.assigned_company_id
         AND response = 'accepted';

      INSERT INTO public.notifications (user_id, type, payload)
      SELECT c.user_id,
             'job_filled',
             jsonb_build_object(
               'project_id', v_request.project_id,
               'slot_id', v_slot_id,
               'message', 'The homeowner approved a GC recommendation to replace this trade scope.',
               'deep_link', '/(company)'
             )
        FROM public.companies c
       WHERE c.id = v_trade_slot.assigned_company_id
         AND c.user_id IS NOT NULL;
    END IF;

    UPDATE public.project_slots
       SET assigned_company_id = NULL,
           fulfillment_type = 'external',
           external_trade_name = COALESCE(v_recommended_trade_name, v_recommended_company),
           external_trade_company = v_recommended_company,
           external_trade_email = CASE WHEN v_recommended_contact LIKE '%@%' THEN lower(v_recommended_contact) ELSE NULL END,
           external_trade_phone = CASE WHEN v_recommended_contact IS NOT NULL AND v_recommended_contact NOT LIKE '%@%' THEN v_recommended_contact ELSE NULL END,
           external_trade_verification_status = 'unverified',
           external_trade_document_urls = '{}',
           external_trade_notes = concat_ws(
             E'\n',
             v_recommendation_note,
             CASE
               WHEN v_trade_slot.assigned_company_id IS NULL THEN 'Homeowner approved GC trade recommendation. Unverified external trade; no WalkerAI escrow protection.'
               ELSE 'Homeowner approved GC trade replacement. Previous unfunded WalkerAI trade was removed. Unverified external trade; no WalkerAI escrow protection.'
             END
           ),
           externally_managed_by_gc_id = v_request.requested_by_gc_id,
           externally_managed_at = NOW(),
           accepted_at = NULL,
           scheduled_start_date = NULL,
           scheduled_end_date = NULL,
           status = 'filled'
     WHERE id = v_slot_id
       AND project_id = v_request.project_id;
  END IF;

  IF p_status = 'approved'
     AND v_request.request_type = 'general_recommendation'
     AND v_request.metadata->>'action' = 'update_gc_budget' THEN
    v_budget_min := NULLIF(v_request.metadata->>'proposed_ai_cost_min', '')::INTEGER;
    v_budget_max := NULLIF(v_request.metadata->>'proposed_ai_cost_max', '')::INTEGER;

    IF v_budget_min IS NULL OR v_budget_max IS NULL OR v_budget_min <= 0 OR v_budget_max <= 0 OR v_budget_max < v_budget_min THEN
      RAISE EXCEPTION 'GC budget approval request is missing a valid estimate range';
    END IF;

    UPDATE public.projects
       SET ai_cost_min = v_budget_min,
           ai_cost_max = v_budget_max,
           status = CASE WHEN status = 'draft' THEN 'brief_ready' ELSE status END
     WHERE id = v_request.project_id
       AND homeowner_id = v_request.homeowner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Project not found for budget approval';
    END IF;
  END IF;

  IF p_status = 'approved'
     AND v_request.request_type = 'general_recommendation'
     AND v_request.metadata->>'action' = 'update_gc_terms' THEN
    v_markup_pct := NULLIF(v_request.metadata->>'proposed_markup_pct', '')::NUMERIC;
    v_concierge_fee_pct := NULLIF(v_request.metadata->>'proposed_concierge_fee_pct', '')::NUMERIC;

    IF v_markup_pct IS NULL OR v_markup_pct < 0 OR v_markup_pct > 50 THEN
      RAISE EXCEPTION 'GC markup approval request is missing a valid markup percentage';
    END IF;

    IF v_concierge_fee_pct IS NULL OR v_concierge_fee_pct < 0 OR v_concierge_fee_pct > 25 THEN
      RAISE EXCEPTION 'GC terms approval request is missing a valid concierge fee percentage';
    END IF;

    UPDATE public.general_contractor_projects
       SET markup_pct = v_markup_pct,
           concierge_fee_pct = v_concierge_fee_pct,
           updated_at = NOW()
     WHERE project_id = v_request.project_id
       AND general_contractor_id = v_request.requested_by_gc_id
       AND homeowner_id = v_request.homeowner_id
       AND status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Active GC assignment not found for terms approval';
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
