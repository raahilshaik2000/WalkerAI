-- Direct GC project tools should follow the same account contract as invite,
-- activation, concierge, and approval/payment/trade request surfaces:
-- a real general_contractor user, verified by WalkerAI, with complete
-- business/location/license/insurance setup.

DROP POLICY IF EXISTS "messages_project_participants_insert" ON public.messages;
CREATE POLICY "messages_project_participants_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND project_id IN (
      SELECT id FROM public.projects WHERE homeowner_id = (SELECT auth.uid())
      UNION
      SELECT q.project_id
      FROM public.quotes q
      JOIN public.companies c ON c.id = q.company_id
      WHERE c.user_id = (SELECT auth.uid())
      UNION
      SELECT ps.project_id
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE c.user_id = (SELECT auth.uid())
      UNION
      SELECT gcp.project_id
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      WHERE gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
        AND gcp.status IN ('invited', 'active')
    )
  );

DROP POLICY IF EXISTS "permits_gc_managed_insert_row" ON public.permits;
CREATE POLICY "permits_gc_managed_insert_row" ON public.permits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "permits_gc_managed_update_row" ON public.permits;
CREATE POLICY "permits_gc_managed_update_row" ON public.permits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "permits_gc_managed_insert" ON storage.objects;
CREATE POLICY "permits_gc_managed_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "permits_gc_managed_update" ON storage.objects;
CREATE POLICY "permits_gc_managed_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  )
  WITH CHECK (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
        AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
        AND NULLIF(TRIM(gc.city), '') IS NOT NULL
        AND NULLIF(TRIM(gc.province), '') IS NOT NULL
        AND gc.lat IS NOT NULL
        AND gc.lng IS NOT NULL
        AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
        AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
        AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
    )
  );

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
  SELECT gc.*
    INTO v_gc
    FROM public.general_contractors gc
    JOIN public.users u
      ON u.id = gc.user_id
     AND u.role = 'general_contractor'
   WHERE gc.user_id = (SELECT auth.uid())
   ORDER BY gc.created_at DESC
   LIMIT 1;

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'General contractor profile not found';
  END IF;

  IF v_gc.verified IS NOT TRUE
    OR NULLIF(TRIM(v_gc.business_name), '') IS NULL
    OR NULLIF(TRIM(v_gc.city), '') IS NULL
    OR NULLIF(TRIM(v_gc.province), '') IS NULL
    OR v_gc.lat IS NULL
    OR v_gc.lng IS NULL
    OR NULLIF(TRIM(v_gc.license_number), '') IS NULL
    OR NULLIF(TRIM(v_gc.license_doc_url), '') IS NULL
    OR NULLIF(TRIM(v_gc.insurance_doc_url), '') IS NULL
  THEN
    RAISE EXCEPTION 'Only verified General Contractors with complete business, license, and insurance setup can mark external trades';
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

CREATE OR REPLACE FUNCTION public.add_external_trade_document(
  p_slot_id UUID,
  p_document_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc public.general_contractors%ROWTYPE;
  v_slot public.project_slots%ROWTYPE;
  v_document_url TEXT;
  v_document_parts TEXT[];
BEGIN
  SELECT gc.*
    INTO v_gc
    FROM public.general_contractors gc
    JOIN public.users u
      ON u.id = gc.user_id
     AND u.role = 'general_contractor'
   WHERE gc.user_id = (SELECT auth.uid())
   ORDER BY gc.created_at DESC
   LIMIT 1;

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'General contractor profile not found';
  END IF;

  IF v_gc.verified IS NOT TRUE
    OR NULLIF(TRIM(v_gc.business_name), '') IS NULL
    OR NULLIF(TRIM(v_gc.city), '') IS NULL
    OR NULLIF(TRIM(v_gc.province), '') IS NULL
    OR v_gc.lat IS NULL
    OR v_gc.lng IS NULL
    OR NULLIF(TRIM(v_gc.license_number), '') IS NULL
    OR NULLIF(TRIM(v_gc.license_doc_url), '') IS NULL
    OR NULLIF(TRIM(v_gc.insurance_doc_url), '') IS NULL
  THEN
    RAISE EXCEPTION 'Only verified General Contractors with complete business, license, and insurance setup can add external trade documents';
  END IF;

  SELECT *
    INTO v_slot
    FROM public.project_slots
   WHERE id = p_slot_id
   FOR UPDATE;

  IF v_slot.id IS NULL THEN
    RAISE EXCEPTION 'Project slot not found';
  END IF;

  IF v_slot.fulfillment_type <> 'external' THEN
    RAISE EXCEPTION 'Documents can only be attached to externally managed trades';
  END IF;

  v_document_url := trim(COALESCE(p_document_url, ''));
  IF v_document_url = '' THEN
    RAISE EXCEPTION 'Document URL is required';
  END IF;

  v_document_parts := string_to_array(v_document_url, '/');
  IF array_length(v_document_parts, 1) <> 4
     OR v_document_parts[1] <> 'external-trades'
     OR v_document_parts[2] <> (SELECT auth.uid())::TEXT
     OR v_document_parts[3] <> v_slot.project_id::TEXT
     OR v_document_parts[4] NOT LIKE v_slot.id::TEXT || '-%'
  THEN
    RAISE EXCEPTION 'External trade document path does not match this GC project slot';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.general_contractor_projects gcp
    WHERE gcp.project_id = v_slot.project_id
      AND gcp.general_contractor_id = v_gc.id
      AND gcp.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active GC management is required before adding external trade documents';
  END IF;

  UPDATE public.project_slots
     SET external_trade_document_urls = array_append(
           array_remove(COALESCE(external_trade_document_urls, '{}'), v_document_url),
           v_document_url
         ),
         external_trade_verification_status = CASE
           WHEN external_trade_verification_status = 'walker_verified' THEN 'walker_verified'
           ELSE 'documents_uploaded'
         END
   WHERE id = p_slot_id;

  RETURN p_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_external_trade_document(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_external_trade_document(UUID, TEXT) TO authenticated;
