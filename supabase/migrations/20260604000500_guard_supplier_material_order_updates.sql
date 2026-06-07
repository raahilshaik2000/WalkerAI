-- Restrict direct supplier updates on material orders to fulfillment-only fields.
-- Payout, pricing, ownership, and homeowner confirmation remain server/homeowner controlled.

CREATE OR REPLACE FUNCTION public.enforce_supplier_material_order_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_supplier_id uuid;
BEGIN
  -- Service-role edge functions and unauthenticated maintenance paths do not have auth.uid().
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.id
  INTO v_supplier_id
  FROM public.suppliers s
  WHERE s.user_id = (SELECT auth.uid())
    AND s.id = OLD.accepted_supplier_id;

  IF v_supplier_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.material_id IS DISTINCT FROM OLD.material_id
    OR NEW.accepted_supplier_id IS DISTINCT FROM OLD.accepted_supplier_id
    OR NEW.catalog_item_id IS DISTINCT FROM OLD.catalog_item_id
    OR NEW.quantity_needed IS DISTINCT FROM OLD.quantity_needed
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.quality_tier IS DISTINCT FROM OLD.quality_tier
    OR NEW.offered_price IS DISTINCT FROM OLD.offered_price
    OR NEW.final_price IS DISTINCT FROM OLD.final_price
    OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
    OR NEW.delivery_deadline IS DISTINCT FROM OLD.delivery_deadline
    OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
    OR NEW.stripe_transfer_id IS DISTINCT FROM OLD.stripe_transfer_id
    OR NEW.platform_fee_pct IS DISTINCT FROM OLD.platform_fee_pct
    OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
    OR NEW.notes IS DISTINCT FROM OLD.notes
  THEN
    RAISE EXCEPTION 'Suppliers can only update fulfillment status, tracking, and delivery proof';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'accepted' AND NEW.status = 'processing')
      OR (OLD.status = 'processing' AND NEW.status = 'shipped')
      OR (OLD.status = 'shipped' AND NEW.status = 'delivered')
    ) THEN
      RAISE EXCEPTION 'Invalid supplier material order status transition';
    END IF;
  END IF;

  IF NOT (OLD.status = 'processing' AND NEW.status = 'shipped') THEN
    IF NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
      OR NEW.carrier IS DISTINCT FROM OLD.carrier
      OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
    THEN
      RAISE EXCEPTION 'Tracking can only be set when marking an order shipped';
    END IF;
  ELSE
    IF NEW.tracking_number IS NULL OR length(trim(NEW.tracking_number)) = 0 OR NEW.shipped_at IS NULL THEN
      RAISE EXCEPTION 'Tracking number and shipped_at are required to mark an order shipped';
    END IF;
  END IF;

  IF NOT (OLD.status = 'shipped' AND NEW.status = 'delivered') THEN
    IF NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
      OR NEW.delivery_photo_url IS DISTINCT FROM OLD.delivery_photo_url
    THEN
      RAISE EXCEPTION 'Delivery proof can only be set when marking an order delivered';
    END IF;
  ELSE
    IF NEW.delivered_at IS NULL OR NEW.delivery_photo_url IS NULL OR length(trim(NEW.delivery_photo_url)) = 0 THEN
      RAISE EXCEPTION 'Delivered_at and delivery_photo_url are required to mark an order delivered';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_supplier_material_order_updates_trigger ON public.material_orders;

CREATE TRIGGER enforce_supplier_material_order_updates_trigger
  BEFORE UPDATE ON public.material_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_supplier_material_order_updates();
