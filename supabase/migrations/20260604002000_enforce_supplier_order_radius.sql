-- Supplier order access must match the same service-area rules used for
-- notifications. Category-only matching let suppliers see and claim orders
-- outside their delivery radius.

CREATE OR REPLACE FUNCTION public.supplier_can_fulfill_material_order(
  p_order_id UUID,
  p_supplier_id UUID
)
RETURNS boolean
LANGUAGE sql
STABLE
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

DROP POLICY IF EXISTS "orders_supplier_read" ON public.material_orders;

CREATE POLICY "orders_supplier_read" ON public.material_orders
  FOR SELECT TO authenticated
  USING (
    (
      status = 'open'
      AND EXISTS (
        SELECT 1
        FROM public.suppliers s
        WHERE s.user_id = (SELECT auth.uid())
          AND public.supplier_can_fulfill_material_order(material_orders.id, s.id)
      )
    )
    OR accepted_supplier_id IN (
      SELECT id FROM public.suppliers WHERE user_id = (SELECT auth.uid())
    )
  );
