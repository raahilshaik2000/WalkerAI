-- Return verified GC profiles that can serve a homeowner-owned project.
-- Location-aware matching happens server-side so the homeowner UI does not
-- list out-of-area concierge/management options as if they were nearby.

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
  CROSS JOIN target_project
  WHERE gc.verified = TRUE
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
