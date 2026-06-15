-- External trades can provide licenses, insurance, or certifications without
-- triggering paid WalkerAI verification. Documents remain attached to the
-- project slot and change the badge to "documents_uploaded".

ALTER TABLE public.project_slots
  ADD COLUMN IF NOT EXISTS external_trade_document_urls TEXT[] NOT NULL DEFAULT '{}';

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

GRANT EXECUTE ON FUNCTION public.add_external_trade_document(UUID, TEXT) TO authenticated;
