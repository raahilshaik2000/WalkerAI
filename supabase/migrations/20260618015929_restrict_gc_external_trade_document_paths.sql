-- External trade document rows should only reference the document uploaded for
-- that GC, project, and slot. Storage already scopes writes to the same path;
-- this keeps direct RPC calls from attaching arbitrary company-docs objects.

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
