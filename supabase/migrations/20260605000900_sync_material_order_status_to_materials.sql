-- Keep the cached material order fields aligned with the authoritative
-- material_orders row. Supplier fulfillment updates happen directly on
-- material_orders, while some project material surfaces read materials.

CREATE OR REPLACE FUNCTION public.sync_material_order_status_to_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_material_id uuid;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_material_id := OLD.material_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.materials
    SET material_order_id = NEW.id,
        order_status = NEW.status
    WHERE id = NEW.material_id;
  END IF;

  IF v_old_material_id IS NOT NULL
    AND (
      TG_OP = 'DELETE'
      OR (TG_OP = 'UPDATE' AND v_old_material_id IS DISTINCT FROM NEW.material_id)
    )
  THEN
    UPDATE public.materials m
    SET material_order_id = latest_order.id,
        order_status = latest_order.status
    FROM (
      SELECT mo.id, mo.status
      FROM public.material_orders mo
      WHERE mo.material_id = v_old_material_id
        AND (TG_OP <> 'DELETE' OR mo.id <> OLD.id)
      ORDER BY mo.created_at DESC, mo.id DESC
      LIMIT 1
    ) AS latest_order
    WHERE m.id = v_old_material_id;

    IF NOT FOUND THEN
      UPDATE public.materials
      SET material_order_id = NULL,
          order_status = NULL
      WHERE id = v_old_material_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_material_order_status_to_material_trigger ON public.material_orders;

CREATE TRIGGER sync_material_order_status_to_material_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.material_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_material_order_status_to_material();

WITH latest_orders AS (
  SELECT DISTINCT ON (mo.material_id)
    mo.material_id,
    mo.id,
    mo.status
  FROM public.material_orders mo
  ORDER BY mo.material_id, mo.created_at DESC, mo.id DESC
)
UPDATE public.materials m
SET material_order_id = latest_orders.id,
    order_status = latest_orders.status
FROM latest_orders
WHERE m.id = latest_orders.material_id;
