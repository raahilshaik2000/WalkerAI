-- GC assignments are the authority switch for the fourth account type. Direct
-- inserts must not bypass verified-GC discovery, homeowner ownership, the
-- invite/confirm lifecycle, or the one-current-GC-per-project rule.

CREATE OR REPLACE FUNCTION public.guard_gc_assignment_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'invited' THEN
    RAISE EXCEPTION 'GC assignments must start as invited';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.projects p
     WHERE p.id = NEW.project_id
       AND p.homeowner_id = NEW.homeowner_id
  ) THEN
    RAISE EXCEPTION 'GC assignment homeowner must own the project';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.general_contractors gc
     WHERE gc.id = NEW.general_contractor_id
       AND gc.verified IS TRUE
  ) THEN
    RAISE EXCEPTION 'Only verified General Contractors can be assigned to projects';
  END IF;

  IF COALESCE(NEW.initiated_by_gc, FALSE) IS TRUE THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.general_contractors gc
       WHERE gc.id = NEW.general_contractor_id
         AND gc.user_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Only the selected GC can create a GC-initiated assignment';
    END IF;
  ELSIF NEW.homeowner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Only the homeowner can invite a GC to this project';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.general_contractor_projects existing
     WHERE existing.project_id = NEW.project_id
       AND existing.status <> 'removed'
  ) THEN
    RAISE EXCEPTION 'This project already has a current GC assignment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_assignment_creation_trigger ON public.general_contractor_projects;
CREATE TRIGGER guard_gc_assignment_creation_trigger
  BEFORE INSERT ON public.general_contractor_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_assignment_creation();

REVOKE ALL ON FUNCTION public.guard_gc_assignment_creation() FROM PUBLIC, anon, authenticated;
