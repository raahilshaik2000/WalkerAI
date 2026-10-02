-- Allow suppliers to update their own accepted material orders (processing, shipped, delivered)
DROP POLICY IF EXISTS "orders_supplier_update" ON public.material_orders;

CREATE POLICY "orders_supplier_update" ON public.material_orders
  FOR UPDATE
  TO authenticated
  USING (
    accepted_supplier_id IN (
      SELECT s.id FROM public.suppliers s WHERE s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    accepted_supplier_id IN (
      SELECT s.id FROM public.suppliers s WHERE s.user_id = auth.uid()
    )
  );
