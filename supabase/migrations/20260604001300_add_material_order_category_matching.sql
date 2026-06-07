-- Supplier onboarding categories must control which open material orders a
-- supplier can see and claim.

ALTER TABLE public.material_orders
  ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE public.material_orders mo
SET category = CASE
  WHEN m.item ~* 'cabinet|vanity cabinet|storage|shelv' THEN 'Cabinets & Storage'
  WHEN m.item ~* 'countertop|quartz|granite|marble|stone|laminate countertop|surface' THEN 'Countertops & Surfaces'
  WHEN m.item ~* 'tile|floor|hardwood|vinyl|lvp|laminate|backsplash' THEN 'Tile & Flooring'
  WHEN m.item ~* 'toilet|tub|shower|faucet|sink|basin|valve|plumbing' THEN 'Plumbing Fixtures'
  WHEN m.item ~* 'light|lighting|pot light|recessed|gfi|gfci|electrical|fan|ventilation' THEN 'Lighting & Electrical'
  WHEN m.item ~* 'appliance|range|oven|fridge|refrigerator|dishwasher|microwave|hood' THEN 'Appliances'
  WHEN m.item ~* 'hardware|hinge|pull|handle|knob|door hardware' THEN 'Hardware & Fixtures'
  WHEN m.item ~* 'paint|primer|wall covering|wallpaper' THEN 'Paint & Wall Coverings'
  WHEN m.item ~* 'lumber|stud|plywood|subfloor|joist|beam|framing' THEN 'Lumber & Structural'
  WHEN m.item ~* 'window|door|casing|baseboard|trim' THEN 'Windows & Doors'
  WHEN m.item ~* 'drywall|cement board|insulation|membrane|waterproof' THEN 'Insulation & Drywall'
  ELSE 'Other'
END
FROM public.materials m
WHERE m.id = mo.material_id
  AND mo.category IS NULL;

UPDATE public.material_orders
SET category = 'Other'
WHERE category IS NULL;

ALTER TABLE public.material_orders
  ALTER COLUMN category SET DEFAULT 'Other',
  ALTER COLUMN category SET NOT NULL,
  DROP CONSTRAINT IF EXISTS material_orders_category_check,
  ADD CONSTRAINT material_orders_category_check CHECK (
    category IN (
      'Cabinets & Storage',
      'Countertops & Surfaces',
      'Tile & Flooring',
      'Plumbing Fixtures',
      'Lighting & Electrical',
      'Appliances',
      'Hardware & Fixtures',
      'Paint & Wall Coverings',
      'Lumber & Structural',
      'Windows & Doors',
      'Insulation & Drywall',
      'Other'
    )
  );

CREATE INDEX IF NOT EXISTS idx_material_orders_category
  ON public.material_orders(category);

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
          AND s.verified = TRUE
          AND material_orders.category = ANY(s.categories)
      )
    )
    OR accepted_supplier_id IN (
      SELECT id FROM public.suppliers WHERE user_id = (SELECT auth.uid())
    )
  );
