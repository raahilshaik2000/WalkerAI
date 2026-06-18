-- Homeowner GC discovery and invitations should only expose contractors that
-- meet the complete trust-profile contract, not any row with verified=true.

CREATE OR REPLACE FUNCTION public.general_contractors_for_project(p_project_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  business_name TEXT,
  address TEXT,
  city TEXT,
  province CHAR(2),
  postal_code TEXT,
  location GEOGRAPHY(Point, 4326),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  service_radius_km INTEGER,
  license_number TEXT,
  license_doc_url TEXT,
  insurance_doc_url TEXT,
  stripe_account_id TEXT,
  stripe_details_submitted BOOLEAN,
  stripe_payouts_enabled BOOLEAN,
  stripe_transfers_active BOOLEAN,
  stripe_onboarding_checked_at TIMESTAMPTZ,
  verified BOOLEAN,
  concierge_enabled BOOLEAN,
  default_markup_pct NUMERIC(5,2),
  default_concierge_fee_pct NUMERIC(5,2),
  rating NUMERIC(3,2),
  total_reviews INTEGER,
  created_at TIMESTAMPTZ,
  distance_km DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH target_project AS (
    SELECT
      p.location,
      CASE
        WHEN p.location IS NOT NULL THEN p.location
        WHEN p.lat IS NOT NULL AND p.lng IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography
        ELSE NULL
      END AS project_geography
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.homeowner_id = (SELECT auth.uid())
    LIMIT 1
  )
  SELECT
    gc.id,
    gc.user_id,
    gc.business_name,
    gc.address,
    gc.city,
    gc.province,
    gc.postal_code,
    gc.location,
    gc.lat,
    gc.lng,
    gc.service_radius_km,
    gc.license_number,
    gc.license_doc_url,
    gc.insurance_doc_url,
    gc.stripe_account_id,
    gc.stripe_details_submitted,
    gc.stripe_payouts_enabled,
    gc.stripe_transfers_active,
    gc.stripe_onboarding_checked_at,
    gc.verified,
    gc.concierge_enabled,
    gc.default_markup_pct,
    gc.default_concierge_fee_pct,
    gc.rating,
    gc.total_reviews,
    gc.created_at,
    CASE
      WHEN target_project.project_geography IS NOT NULL AND gc.location IS NOT NULL
        THEN ST_Distance(gc.location, target_project.project_geography) / 1000
      ELSE NULL
    END AS distance_km
  FROM public.general_contractors gc
  JOIN public.users u ON u.id = gc.user_id
  CROSS JOIN target_project
  WHERE u.role = 'general_contractor'
    AND gc.verified = TRUE
    AND trim(COALESCE(gc.business_name, '')) <> ''
    AND trim(COALESCE(gc.city, '')) <> ''
    AND trim(COALESCE(gc.province::TEXT, '')) <> ''
    AND gc.lat IS NOT NULL
    AND gc.lng IS NOT NULL
    AND trim(COALESCE(gc.license_number, '')) <> ''
    AND trim(COALESCE(gc.license_doc_url, '')) <> ''
    AND trim(COALESCE(gc.insurance_doc_url, '')) <> ''
    AND (
      target_project.project_geography IS NULL
      OR gc.location IS NULL
      OR ST_DWithin(gc.location, target_project.project_geography, gc.service_radius_km * 1000)
    )
  ORDER BY
    CASE WHEN target_project.project_geography IS NOT NULL AND gc.location IS NOT NULL THEN 0 ELSE 1 END,
    distance_km ASC NULLS LAST,
    gc.rating DESC NULLS LAST,
    gc.created_at DESC;
$$;

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
  v_gc public.general_contractors%ROWTYPE;
  v_assignment_id UUID;
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

  SELECT gc.*
    INTO v_gc
    FROM public.general_contractors gc
    JOIN public.users u ON u.id = gc.user_id
   WHERE gc.id = p_general_contractor_id
     AND u.role = 'general_contractor'
     AND gc.verified IS TRUE
     AND trim(COALESCE(gc.business_name, '')) <> ''
     AND trim(COALESCE(gc.city, '')) <> ''
     AND trim(COALESCE(gc.province::TEXT, '')) <> ''
     AND gc.lat IS NOT NULL
     AND gc.lng IS NOT NULL
     AND trim(COALESCE(gc.license_number, '')) <> ''
     AND trim(COALESCE(gc.license_doc_url, '')) <> ''
     AND trim(COALESCE(gc.insurance_doc_url, '')) <> '';

  IF v_gc.id IS NULL THEN
    RAISE EXCEPTION 'Only verified General Contractors with complete business, license, and insurance setup can be invited';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.general_contractor_projects existing
     WHERE existing.project_id = p_project_id
       AND existing.status <> 'removed'
  ) THEN
    RAISE EXCEPTION 'This project already has a current GC assignment';
  END IF;

  INSERT INTO public.general_contractor_projects (
    project_id,
    general_contractor_id,
    homeowner_id,
    status,
    markup_pct,
    concierge_fee_pct,
    initiated_by_gc
  )
  VALUES (
    v_project.id,
    v_gc.id,
    v_project.homeowner_id,
    'invited',
    v_gc.default_markup_pct,
    v_gc.default_concierge_fee_pct,
    FALSE
  )
  RETURNING id INTO v_assignment_id;

  RETURN v_assignment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.general_contractors_for_project(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.general_contractors_for_project(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.invite_gc_to_project(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_gc_to_project(UUID, UUID) TO authenticated;
