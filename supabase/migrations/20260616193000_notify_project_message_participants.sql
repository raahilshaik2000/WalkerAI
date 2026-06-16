-- Notify project conversation participants when a new chat message is posted.
-- This keeps the shared homeowner/company/GC message hub useful even when
-- recipients do not have the project thread open.

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

DROP TRIGGER IF EXISTS notify_project_message_participants_trigger ON public.messages;
CREATE TRIGGER notify_project_message_participants_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_project_message_participants();

REVOKE ALL ON FUNCTION public.notify_project_message_participants() FROM PUBLIC, anon, authenticated;
