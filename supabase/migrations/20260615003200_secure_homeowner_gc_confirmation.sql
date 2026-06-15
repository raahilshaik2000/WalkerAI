-- Homeowners confirm GC-created management assignments through a narrow RPC.
-- This avoids broad direct updates to GC assignment rows while preserving the
-- homeowner as the final approval authority.

DROP POLICY IF EXISTS "gc_projects_homeowner_update" ON public.general_contractor_projects;

CREATE OR REPLACE FUNCTION public.confirm_gc_management_assignment(p_assignment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.general_contractor_projects%ROWTYPE;
BEGIN
  SELECT *
    INTO v_assignment
    FROM public.general_contractor_projects
   WHERE id = p_assignment_id
     AND homeowner_id = (SELECT auth.uid())
   FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'GC management assignment not found';
  END IF;

  IF v_assignment.initiated_by_gc IS NOT TRUE THEN
    RAISE EXCEPTION 'GC-created assignment is required for homeowner confirmation';
  END IF;

  IF v_assignment.status <> 'invited' THEN
    RAISE EXCEPTION 'Only pending GC management assignments can be confirmed';
  END IF;

  UPDATE public.general_contractor_projects
     SET status = 'active'
   WHERE id = v_assignment.id;

  RETURN v_assignment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_gc_management_assignment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_gc_management_assignment(UUID) TO authenticated;
