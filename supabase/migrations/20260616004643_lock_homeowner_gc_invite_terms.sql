-- Homeowner-created GC invites must use the selected GC's current default
-- terms. The client can propose which verified GC to invite, but it should not
-- be able to rewrite the GC's markup or concierge fee during assignment insert.

CREATE OR REPLACE FUNCTION public.guard_gc_assignment_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc public.general_contractors%ROWTYPE;
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

  SELECT *
    INTO v_gc
    FROM public.general_contractors gc
   WHERE gc.id = NEW.general_contractor_id
     AND gc.verified IS TRUE;

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'Only verified General Contractors can be assigned to projects';
  END IF;

  IF COALESCE(NEW.initiated_by_gc, FALSE) IS TRUE THEN
    IF v_gc.user_id <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Only the selected GC can create a GC-initiated assignment';
    END IF;
  ELSE
    IF NEW.homeowner_id IS DISTINCT FROM (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Only the homeowner can invite a GC to this project';
    END IF;

    NEW.markup_pct := v_gc.default_markup_pct;
    NEW.concierge_fee_pct := v_gc.default_concierge_fee_pct;
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

REVOKE ALL ON FUNCTION public.guard_gc_assignment_creation() FROM PUBLIC, anon, authenticated;
