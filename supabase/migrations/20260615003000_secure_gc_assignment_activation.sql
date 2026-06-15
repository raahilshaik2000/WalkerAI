-- Tighten GC assignment activation. Homeowners can confirm or update their
-- project management assignment directly; GCs can only accept homeowner-
-- initiated invites through a narrow RPC.

DROP POLICY IF EXISTS "gc_projects_participant_update" ON public.general_contractor_projects;

DROP POLICY IF EXISTS "gc_projects_homeowner_update" ON public.general_contractor_projects;
CREATE POLICY "gc_projects_homeowner_update" ON public.general_contractor_projects
  FOR UPDATE USING (homeowner_id = (SELECT auth.uid()))
  WITH CHECK (homeowner_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.accept_gc_management_invite(p_assignment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.general_contractor_projects%ROWTYPE;
BEGIN
  SELECT gcp.*
    INTO v_assignment
    FROM public.general_contractor_projects gcp
    JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
   WHERE gcp.id = p_assignment_id
     AND gc.user_id = (SELECT auth.uid())
   FOR UPDATE OF gcp;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'GC management invite not found';
  END IF;

  IF v_assignment.initiated_by_gc IS TRUE THEN
    RAISE EXCEPTION 'Homeowner confirmation is required for GC-created projects';
  END IF;

  IF v_assignment.status <> 'invited' THEN
    RAISE EXCEPTION 'Only pending GC invites can be accepted';
  END IF;

  UPDATE public.general_contractor_projects
     SET status = 'active'
   WHERE id = v_assignment.id;

  RETURN v_assignment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_gc_management_invite(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_gc_management_invite(UUID) TO authenticated;
