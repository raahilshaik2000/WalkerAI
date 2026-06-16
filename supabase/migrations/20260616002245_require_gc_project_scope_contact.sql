-- GC-created projects require enough homeowner-facing context for approval.
-- The app already asks for homeowner name and scope summary; enforce the same
-- contract inside the security-definer RPC so direct calls cannot create vague
-- draft projects for homeowners to confirm.

CREATE OR REPLACE FUNCTION public.create_gc_managed_project(
  p_homeowner_email TEXT,
  p_address TEXT,
  p_city TEXT,
  p_province TEXT,
  p_postal_code TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_room_type TEXT,
  p_scope_summary TEXT,
  p_markup_pct NUMERIC DEFAULT NULL,
  p_concierge_fee_pct NUMERIC DEFAULT NULL,
  p_homeowner_contact_name TEXT DEFAULT NULL,
  p_homeowner_contact_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc public.general_contractors%ROWTYPE;
  v_homeowner public.users%ROWTYPE;
  v_project_id UUID;
  v_markup_pct NUMERIC;
  v_concierge_fee_pct NUMERIC;
  v_project_type TEXT;
  v_scope_summary TEXT;
  v_homeowner_contact_name TEXT;
BEGIN
  SELECT *
    INTO v_gc
    FROM public.general_contractors
   WHERE user_id = (SELECT auth.uid())
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'General contractor profile not found';
  END IF;

  IF v_gc.verified IS NOT TRUE THEN
    RAISE EXCEPTION 'General contractor verification is required before creating managed projects';
  END IF;

  SELECT *
    INTO v_homeowner
    FROM public.users
   WHERE lower(email) = lower(trim(p_homeowner_email))
     AND role = 'homeowner'
   LIMIT 1;

  IF v_homeowner.id IS NULL THEN
    RAISE EXCEPTION 'No homeowner account found for that email';
  END IF;

  v_project_type := lower(trim(COALESCE(p_room_type, '')));
  v_scope_summary := trim(COALESCE(p_scope_summary, ''));
  v_homeowner_contact_name := trim(COALESCE(p_homeowner_contact_name, ''));

  IF v_project_type NOT IN ('kitchen', 'bathroom', 'flooring', 'painting', 'basement', 'addition', 'other') THEN
    RAISE EXCEPTION 'Project type must be kitchen, bathroom, flooring, painting, basement, addition, or other';
  END IF;

  IF v_scope_summary = '' THEN
    RAISE EXCEPTION 'Scope summary is required before creating managed projects';
  END IF;

  IF v_homeowner_contact_name = '' THEN
    RAISE EXCEPTION 'Homeowner contact name is required before creating managed projects';
  END IF;

  IF trim(COALESCE(p_address, '')) = '' OR trim(COALESCE(p_city, '')) = '' OR trim(COALESCE(p_province, '')) = '' THEN
    RAISE EXCEPTION 'Project address, city, and province are required';
  END IF;

  IF p_lat IS NULL
    OR p_lng IS NULL
    OR p_lat < -90
    OR p_lat > 90
    OR p_lng < -180
    OR p_lng > 180
  THEN
    RAISE EXCEPTION 'Valid project coordinates are required before creating managed projects';
  END IF;

  v_markup_pct := COALESCE(p_markup_pct, v_gc.default_markup_pct);
  v_concierge_fee_pct := COALESCE(p_concierge_fee_pct, v_gc.default_concierge_fee_pct);

  IF v_markup_pct < 0 OR v_markup_pct > 50 THEN
    RAISE EXCEPTION 'Markup must be between 0 and 50 percent';
  END IF;

  IF v_concierge_fee_pct < 0 OR v_concierge_fee_pct > 25 THEN
    RAISE EXCEPTION 'Concierge fee must be between 0 and 25 percent';
  END IF;

  INSERT INTO public.projects (
    homeowner_id,
    address,
    city,
    province,
    postal_code,
    lat,
    lng,
    room_type,
    status,
    description
  )
  VALUES (
    v_homeowner.id,
    trim(p_address),
    trim(p_city),
    upper(trim(p_province)),
    NULLIF(trim(COALESCE(p_postal_code, '')), ''),
    p_lat,
    p_lng,
    CASE WHEN v_project_type IN ('kitchen', 'bathroom') THEN v_project_type ELSE NULL END,
    'draft',
    v_scope_summary
  )
  RETURNING id INTO v_project_id;

  INSERT INTO public.general_contractor_projects (
    project_id,
    general_contractor_id,
    homeowner_id,
    status,
    concierge_fee_pct,
    markup_pct,
    project_type,
    scope_summary,
    initiated_by_gc,
    homeowner_contact_name,
    homeowner_contact_email,
    homeowner_contact_phone
  )
  VALUES (
    v_project_id,
    v_gc.id,
    v_homeowner.id,
    'invited',
    v_concierge_fee_pct,
    v_markup_pct,
    v_project_type,
    v_scope_summary,
    TRUE,
    v_homeowner_contact_name,
    lower(trim(p_homeowner_email)),
    NULLIF(trim(COALESCE(p_homeowner_contact_phone, '')), '')
  );

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    v_homeowner.id,
    'gc_management_invited',
    jsonb_build_object(
      'project_id', v_project_id,
      'general_contractor_id', v_gc.id,
      'message', 'A General Contractor created a draft project for your approval.'
    )
  );

  RETURN v_project_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_gc_managed_project(
  TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_gc_managed_project(
  TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT
) TO authenticated;
