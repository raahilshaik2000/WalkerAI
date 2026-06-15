-- External trade support for GC-managed projects.
-- This records when a GC manages a scope outside WalkerAI. It is explicitly
-- not WalkerAI verified, not escrow protected, and not dispute managed.

ALTER TABLE public.project_slots
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'walker_ai'
    CHECK (fulfillment_type IN ('walker_ai', 'external')),
  ADD COLUMN IF NOT EXISTS external_trade_name TEXT,
  ADD COLUMN IF NOT EXISTS external_trade_company TEXT,
  ADD COLUMN IF NOT EXISTS external_trade_email TEXT,
  ADD COLUMN IF NOT EXISTS external_trade_phone TEXT,
  ADD COLUMN IF NOT EXISTS external_trade_verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (external_trade_verification_status IN ('unverified', 'documents_uploaded', 'walker_verified')),
  ADD COLUMN IF NOT EXISTS external_trade_notes TEXT,
  ADD COLUMN IF NOT EXISTS externally_managed_by_gc_id UUID REFERENCES public.general_contractors(id),
  ADD COLUMN IF NOT EXISTS externally_managed_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "projects_gc_managed_read" ON public.projects;
CREATE POLICY "projects_gc_managed_read" ON public.projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = projects.id
        AND gcp.status IN ('invited', 'active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "slots_gc_managed_read" ON public.project_slots;
CREATE POLICY "slots_gc_managed_read" ON public.project_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = project_slots.project_id
        AND gcp.status IN ('invited', 'active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "change_orders_gc_managed_read" ON public.change_orders;
CREATE POLICY "change_orders_gc_managed_read" ON public.change_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = change_orders.project_id
        AND gcp.status IN ('invited', 'active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
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

GRANT EXECUTE ON FUNCTION public.mark_project_slot_externally_managed(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
