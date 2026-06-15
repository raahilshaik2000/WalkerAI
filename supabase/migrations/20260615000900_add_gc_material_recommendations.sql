-- GC material sourcing recommendations. GCs can view material/order data on
-- active managed projects and homeowner-approved substitutions update only
-- material preference fields, not supplier orders or escrow.

DROP POLICY IF EXISTS "materials_gc_managed_select" ON public.materials;
CREATE POLICY "materials_gc_managed_select" ON public.materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = materials.project_id
        AND gcp.status IN ('invited', 'active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "material_orders_gc_managed_select" ON public.material_orders;
CREATE POLICY "material_orders_gc_managed_select" ON public.material_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = material_orders.project_id
        AND gcp.status IN ('invited', 'active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

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

  RETURN p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_project_approval_request(UUID, TEXT, TEXT) TO authenticated;
