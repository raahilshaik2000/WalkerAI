-- Stale pending assignments may predate the complete-profile invite rules.
-- Re-check the full GC account contract at activation so old invites cannot
-- become active management access for incomplete or mismatched profiles.

CREATE OR REPLACE FUNCTION public.accept_gc_management_invite(p_assignment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.general_contractor_projects%ROWTYPE;
  v_gc_ready BOOLEAN;
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

  SELECT EXISTS (
    SELECT 1
      FROM public.general_contractors gc
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
     WHERE gc.id = v_assignment.general_contractor_id
       AND gc.user_id = (SELECT auth.uid())
       AND gc.verified IS TRUE
       AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
       AND NULLIF(TRIM(gc.city), '') IS NOT NULL
       AND NULLIF(TRIM(gc.province), '') IS NOT NULL
       AND gc.lat IS NOT NULL
       AND gc.lng IS NOT NULL
       AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
       AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
       AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
  )
    INTO v_gc_ready;

  IF v_gc_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified General Contractors with complete business, license, and insurance setup can activate management assignments';
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

CREATE OR REPLACE FUNCTION public.confirm_gc_management_assignment(p_assignment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.general_contractor_projects%ROWTYPE;
  v_gc_ready BOOLEAN;
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

  SELECT EXISTS (
    SELECT 1
      FROM public.general_contractors gc
      JOIN public.users u
        ON u.id = gc.user_id
       AND u.role = 'general_contractor'
     WHERE gc.id = v_assignment.general_contractor_id
       AND gc.verified IS TRUE
       AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
       AND NULLIF(TRIM(gc.city), '') IS NOT NULL
       AND NULLIF(TRIM(gc.province), '') IS NOT NULL
       AND gc.lat IS NOT NULL
       AND gc.lng IS NOT NULL
       AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
       AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
       AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
  )
    INTO v_gc_ready;

  IF v_gc_ready IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified General Contractors with complete business, license, and insurance setup can activate management assignments';
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
