-- Homeowner-created GC invites should carry the same project context that
-- GC-created drafts carry, so the GC dashboard/detail screens are not blank.

CREATE OR REPLACE FUNCTION public.invite_gc_to_project(
  p_project_id UUID,
  p_general_contractor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_homeowner public.users%ROWTYPE;
  v_gc public.general_contractors%ROWTYPE;
  v_assignment_id UUID;
  v_project_type TEXT;
  v_scope_summary TEXT;
BEGIN
  SELECT *
    INTO v_project
    FROM public.projects
   WHERE id = p_project_id
     AND homeowner_id = (SELECT auth.uid())
   FOR UPDATE;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'Project not found for this homeowner';
  END IF;

  SELECT *
    INTO v_homeowner
    FROM public.users
   WHERE id = v_project.homeowner_id;

  IF v_homeowner.id IS NULL THEN
    RAISE EXCEPTION 'Homeowner profile not found for this project';
  END IF;

  SELECT *
    INTO v_gc
    FROM public.general_contractors
   WHERE id = p_general_contractor_id
     AND verified IS TRUE;

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'Only verified General Contractors can be invited';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.general_contractor_projects existing
     WHERE existing.project_id = p_project_id
       AND existing.status <> 'removed'
  ) THEN
    RAISE EXCEPTION 'This project already has a current GC assignment';
  END IF;

  v_project_type := COALESCE(v_project.room_type::TEXT, 'other');
  v_scope_summary := NULLIF(trim(COALESCE(v_project.description, '')), '');

  INSERT INTO public.general_contractor_projects (
    project_id,
    general_contractor_id,
    homeowner_id,
    status,
    markup_pct,
    concierge_fee_pct,
    project_type,
    scope_summary,
    homeowner_contact_name,
    homeowner_contact_email,
    homeowner_contact_phone,
    initiated_by_gc
  )
  VALUES (
    v_project.id,
    v_gc.id,
    v_project.homeowner_id,
    'invited',
    v_gc.default_markup_pct,
    v_gc.default_concierge_fee_pct,
    v_project_type,
    v_scope_summary,
    COALESCE(NULLIF(trim(COALESCE(v_homeowner.full_name, '')), ''), v_homeowner.email),
    v_homeowner.email,
    v_homeowner.phone,
    FALSE
  )
  RETURNING id INTO v_assignment_id;

  RETURN v_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_gc_to_project(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_gc_to_project(UUID, UUID) TO authenticated;
