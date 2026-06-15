-- Homeowners need a narrow way to remove a pending or active GC assignment.
-- The broad direct update policy was removed, so this RPC preserves homeowner
-- authority without letting clients rewrite assignment terms or lifecycle
-- fields directly.

CREATE OR REPLACE FUNCTION public.remove_gc_management_assignment(p_assignment_id UUID)
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

  IF v_assignment.status NOT IN ('invited', 'active') THEN
    RAISE EXCEPTION 'Only pending or active GC management assignments can be removed';
  END IF;

  UPDATE public.general_contractor_projects
     SET status = 'removed'
   WHERE id = v_assignment.id;

  RETURN v_assignment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_gc_management_assignment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_gc_management_assignment(UUID) TO authenticated;
