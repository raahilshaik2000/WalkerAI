CREATE OR REPLACE FUNCTION public.debug_get_supplier_info(p_user_id UUID)
RETURNS TABLE(
  supplier_id UUID,
  business_name TEXT,
  verified BOOLEAN,
  categories TEXT[],
  service_radius_km NUMERIC,
  city TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.business_name, s.verified, s.categories, s.service_radius_km, s.city
  FROM public.suppliers s
  WHERE s.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.debug_get_supplier_info(UUID) TO anon, authenticated, service_role;
