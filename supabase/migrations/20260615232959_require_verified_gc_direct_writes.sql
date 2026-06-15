-- GC direct-write surfaces must re-check current verification. Read policies
-- stay broader so historical project records remain visible to participants.

DROP POLICY IF EXISTS "permits_gc_managed" ON public.permits;
CREATE POLICY "permits_gc_managed" ON public.permits
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = permits.project_id
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
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
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
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
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
    )
  )
  WITH CHECK (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id::text = (storage.foldername(name))[1]
        AND gcp.status = 'active'
        AND gc.user_id = (SELECT auth.uid())
        AND gc.verified IS TRUE
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

  SELECT * INTO v_project FROM public.projects WHERE id = v_slot.project_id;

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
    RAISE EXCEPTION 'Only verified General Contractors can add external trade documents';
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

  IF trim(COALESCE(p_document_url, '')) = '' THEN
    RAISE EXCEPTION 'Document URL is required';
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
           array_remove(COALESCE(external_trade_document_urls, '{}'), trim(p_document_url)),
           trim(p_document_url)
         ),
         external_trade_verification_status = CASE
           WHEN external_trade_verification_status = 'walker_verified' THEN 'walker_verified'
           ELSE 'documents_uploaded'
         END
   WHERE id = p_slot_id;

  RETURN p_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_project_slot_externally_managed(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_external_trade_document(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_project_slot_externally_managed(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_external_trade_document(UUID, TEXT) TO authenticated;
