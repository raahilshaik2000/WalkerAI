-- Fix supplier_can_fulfill_material_order to be SECURITY DEFINER
-- When executing as an authenticated supplier, PostgREST RLS on public.projects
-- prevents the function from reading projects.location, causing all open orders to return false.
CREATE OR REPLACE FUNCTION public.supplier_can_fulfill_material_order(
  p_order_id UUID,
  p_supplier_id UUID
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.material_orders mo
    JOIN public.projects p ON p.id = mo.project_id
    JOIN public.suppliers s ON s.id = p_supplier_id
    WHERE mo.id = p_order_id
      AND mo.status = 'open'
      AND s.verified = TRUE
      AND mo.category = ANY(s.categories)
      AND p.location IS NOT NULL
      AND s.location IS NOT NULL
      AND ST_DWithin(s.location, p.location, s.service_radius_km * 1000)
  );
$$;

GRANT EXECUTE ON FUNCTION public.supplier_can_fulfill_material_order(UUID, UUID) TO authenticated, service_role;
