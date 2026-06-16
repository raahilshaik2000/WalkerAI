-- Suppliers need the material item name/details for orders they can claim or
-- are already fulfilling. Keep access scoped through material_orders so
-- suppliers do not get project-wide material visibility.

DROP POLICY IF EXISTS "materials_supplier_order_select" ON public.materials;

CREATE POLICY "materials_supplier_order_select" ON public.materials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.material_orders mo
      WHERE mo.material_id = materials.id
        AND (
          (
            mo.status = 'open'
            AND EXISTS (
              SELECT 1
              FROM public.suppliers s
              WHERE s.user_id = (SELECT auth.uid())
                AND public.supplier_can_fulfill_material_order(mo.id, s.id)
            )
          )
          OR mo.accepted_supplier_id IN (
            SELECT id
            FROM public.suppliers
            WHERE user_id = (SELECT auth.uid())
          )
        )
    )
  );
