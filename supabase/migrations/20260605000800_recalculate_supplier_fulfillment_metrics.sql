-- Keep supplier profile fulfillment metrics tied to real material-order history.
-- The supplier profile displays "On-time" and "Avg days", but earlier schema only
-- recalculated rating/review count after supplier_reviews.

CREATE OR REPLACE FUNCTION public.recalculate_supplier_fulfillment_metrics(p_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_supplier_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.suppliers s
  SET
    fulfillment_rate = metrics.on_time_rate,
    avg_delivery_days = metrics.avg_delivery_days
  FROM (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (
          WHERE mo.status IN ('delivered', 'confirmed', 'paid')
            AND mo.delivery_deadline IS NOT NULL
            AND mo.delivered_at IS NOT NULL
        ) = 0 THEN NULL
        ELSE ROUND(
          (
            COUNT(*) FILTER (
              WHERE mo.status IN ('delivered', 'confirmed', 'paid')
                AND mo.delivery_deadline IS NOT NULL
                AND mo.delivered_at IS NOT NULL
                AND mo.delivered_at::date <= mo.delivery_deadline
            )::numeric
            / COUNT(*) FILTER (
              WHERE mo.status IN ('delivered', 'confirmed', 'paid')
                AND mo.delivery_deadline IS NOT NULL
                AND mo.delivered_at IS NOT NULL
            )::numeric
          ) * 100,
          2
        )
      END AS on_time_rate,
      ROUND(AVG(
        CASE
          WHEN mo.status IN ('delivered', 'confirmed', 'paid')
            AND mo.delivered_at IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (mo.delivered_at - mo.created_at)) / 86400)
          ELSE NULL
        END
      ))::integer AS avg_delivery_days
    FROM public.material_orders mo
    WHERE mo.accepted_supplier_id = p_supplier_id
  ) metrics
  WHERE s.id = p_supplier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_supplier_fulfillment_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_supplier_fulfillment_metrics(OLD.accepted_supplier_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_supplier_fulfillment_metrics(NEW.accepted_supplier_id);

  IF TG_OP = 'UPDATE'
    AND OLD.accepted_supplier_id IS DISTINCT FROM NEW.accepted_supplier_id
  THEN
    PERFORM public.recalculate_supplier_fulfillment_metrics(OLD.accepted_supplier_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_fulfillment_metrics_update ON public.material_orders;

CREATE TRIGGER supplier_fulfillment_metrics_update
  AFTER INSERT OR UPDATE OF accepted_supplier_id, status, delivered_at, delivery_deadline OR DELETE
  ON public.material_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_supplier_fulfillment_metrics();

-- Backfill existing suppliers from already-fulfilled material orders.
DO $$
DECLARE
  supplier_id uuid;
BEGIN
  FOR supplier_id IN
    SELECT DISTINCT accepted_supplier_id
    FROM public.material_orders
    WHERE accepted_supplier_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_supplier_fulfillment_metrics(supplier_id);
  END LOOP;
END;
$$;
