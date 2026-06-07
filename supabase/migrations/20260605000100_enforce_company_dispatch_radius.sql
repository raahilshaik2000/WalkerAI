-- Contractor dispatch must respect both the homeowner search expansion radius
-- and the contractor's own configured service radius.

CREATE OR REPLACE FUNCTION public.companies_within_radius(
  project_lat FLOAT,
  project_lng FLOAT,
  radius_km FLOAT DEFAULT 50
)
RETURNS TABLE (company_id UUID, distance_km FLOAT)
LANGUAGE sql
STABLE
AS $$
  WITH project_point AS (
    SELECT ST_SetSRID(ST_MakePoint(project_lng, project_lat), 4326)::GEOGRAPHY AS location
  )
  SELECT
    c.id AS company_id,
    ST_Distance(c.location, project_point.location) / 1000 AS distance_km
  FROM public.companies c
  CROSS JOIN project_point
  WHERE
    c.verified = TRUE
    AND COALESCE(c.is_active, TRUE) = TRUE
    AND c.location IS NOT NULL
    AND ST_DWithin(c.location, project_point.location, radius_km * 1000)
    AND ST_DWithin(
      c.location,
      project_point.location,
      COALESCE(NULLIF(c.service_radius_km, 0), radius_km) * 1000
    )
  ORDER BY distance_km
  LIMIT 10;
$$;
