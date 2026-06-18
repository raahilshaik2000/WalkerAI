-- Accepted material-order suppliers are project participants for communication.
-- This lets the shared project message thread match the GC workflow copy:
-- homeowner, GC, trades, and suppliers.

DROP POLICY IF EXISTS "messages_project_participants_select" ON public.messages;
CREATE POLICY "messages_project_participants_select" ON public.messages
  FOR SELECT TO authenticated
  USING (
    project_id IN (
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
      WHERE gc.user_id = (SELECT auth.uid())
        AND gcp.status IN ('invited', 'active', 'completed')
      UNION
      SELECT mo.project_id
      FROM public.material_orders mo
      JOIN public.suppliers s ON s.id = mo.accepted_supplier_id
      WHERE s.user_id = (SELECT auth.uid())
        AND mo.status IN ('accepted', 'processing', 'shipped', 'delivered', 'confirmed', 'paid')
    )
  );

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
      UNION
      SELECT mo.project_id
      FROM public.material_orders mo
      JOIN public.suppliers s ON s.id = mo.accepted_supplier_id
      JOIN public.users u
        ON u.id = s.user_id
       AND u.role = 'supplier'
      WHERE s.user_id = (SELECT auth.uid())
        AND s.verified IS TRUE
        AND mo.status IN ('accepted', 'processing', 'shipped', 'delivered', 'confirmed')
    )
  );

CREATE OR REPLACE FUNCTION public.notify_project_message_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview TEXT;
BEGIN
  IF NEW.project_id IS NULL OR NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_preview := NULLIF(left(trim(COALESCE(NEW.body, '')), 140), '');
  IF v_preview IS NULL AND NEW.attachment_url IS NOT NULL THEN
    v_preview := 'Sent an attachment';
  END IF;

  WITH participant_users AS (
    SELECT p.homeowner_id AS user_id
    FROM public.projects p
    WHERE p.id = NEW.project_id

    UNION

    SELECT c.user_id
    FROM public.projects p
    JOIN public.companies c ON c.id = p.assigned_company_id
    WHERE p.id = NEW.project_id

    UNION

    SELECT c.user_id
    FROM public.project_slots ps
    JOIN public.companies c ON c.id = ps.assigned_company_id
    WHERE ps.project_id = NEW.project_id
      AND ps.status IN ('filled', 'scheduled')

    UNION

    SELECT c.user_id
    FROM public.quotes q
    JOIN public.companies c ON c.id = q.company_id
    WHERE q.project_id = NEW.project_id

    UNION

    SELECT gc.user_id
    FROM public.general_contractor_projects gcp
    JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
    WHERE gcp.project_id = NEW.project_id
      AND gcp.status IN ('invited', 'active', 'completed')

    UNION

    SELECT s.user_id
    FROM public.material_orders mo
    JOIN public.suppliers s ON s.id = mo.accepted_supplier_id
    WHERE mo.project_id = NEW.project_id
      AND mo.status IN ('accepted', 'processing', 'shipped', 'delivered', 'confirmed', 'paid')
  )
  INSERT INTO public.notifications (user_id, type, payload)
  SELECT DISTINCT
    participant.user_id,
    'new_message',
    jsonb_build_object(
      'project_id', NEW.project_id,
      'message_id', NEW.id,
      'sender_id', NEW.sender_id,
      'preview', COALESCE(v_preview, 'You have a new message'),
      'deep_link', '/project/' || NEW.project_id || '/messages'
    )
  FROM participant_users participant
  WHERE participant.user_id IS NOT NULL
    AND participant.user_id <> NEW.sender_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_project_message_participants() FROM PUBLIC, anon, authenticated;
