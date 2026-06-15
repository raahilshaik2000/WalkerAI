-- Notify the right participant when GC project management assignments are
-- created or activated. GC-created projects already notify the homeowner from
-- create_gc_managed_project; this covers homeowner-created GC invites and the
-- activation response in both directions.

CREATE OR REPLACE FUNCTION public.notify_gc_assignment_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_user_id UUID;
BEGIN
  IF NEW.status = 'invited' AND COALESCE(NEW.initiated_by_gc, FALSE) IS FALSE THEN
    SELECT user_id
      INTO v_gc_user_id
      FROM public.general_contractors
     WHERE id = NEW.general_contractor_id;

    IF v_gc_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, payload)
      VALUES (
        v_gc_user_id,
        'gc_management_invite_received',
        jsonb_build_object(
          'project_id', NEW.project_id,
          'assignment_id', NEW.id,
          'homeowner_id', NEW.homeowner_id,
          'general_contractor_id', NEW.general_contractor_id,
          'message', 'A homeowner invited you to manage their project.'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_gc_assignment_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_user_id UUID;
  v_notify_user_id UUID;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'active' THEN
    SELECT user_id
      INTO v_gc_user_id
      FROM public.general_contractors
     WHERE id = NEW.general_contractor_id;

    v_notify_user_id := CASE
      WHEN COALESCE(NEW.initiated_by_gc, FALSE) IS TRUE THEN v_gc_user_id
      ELSE NEW.homeowner_id
    END;

    IF v_notify_user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, payload)
      VALUES (
        v_notify_user_id,
        'gc_management_confirmed',
        jsonb_build_object(
          'project_id', NEW.project_id,
          'assignment_id', NEW.id,
          'homeowner_id', NEW.homeowner_id,
          'general_contractor_id', NEW.general_contractor_id,
          'message', 'GC management is now active for this project.'
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gc_assignment_insert_notification ON public.general_contractor_projects;
CREATE TRIGGER gc_assignment_insert_notification
  AFTER INSERT ON public.general_contractor_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_assignment_insert();

DROP TRIGGER IF EXISTS gc_assignment_activation_notification ON public.general_contractor_projects;
CREATE TRIGGER gc_assignment_activation_notification
  AFTER UPDATE OF status ON public.general_contractor_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_assignment_activation();

REVOKE ALL ON FUNCTION public.notify_gc_assignment_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_assignment_activation() FROM PUBLIC, anon, authenticated;
