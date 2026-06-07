-- Restrict company-side material order updates to quantity sync before supplier claim.
-- Companies verify material quantities in public.materials; if an open material order
-- already exists, the client may sync quantity_needed while it is still unclaimed.

CREATE OR REPLACE FUNCTION public.enforce_company_material_order_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_project_company boolean;
BEGIN
  -- Service-role edge functions and maintenance paths do not have auth.uid().
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    JOIN public.companies c ON c.id = p.assigned_company_id
    WHERE p.id = OLD.project_id
      AND c.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_slots ps
    JOIN public.companies c ON c.id = ps.assigned_company_id
    WHERE ps.project_id = OLD.project_id
      AND c.user_id = (SELECT auth.uid())
  )
  INTO v_is_project_company;

  IF NOT v_is_project_company THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'Companies can only update unclaimed material orders';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.material_id IS DISTINCT FROM OLD.material_id
    OR NEW.accepted_supplier_id IS DISTINCT FROM OLD.accepted_supplier_id
    OR NEW.catalog_item_id IS DISTINCT FROM OLD.catalog_item_id
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.quality_tier IS DISTINCT FROM OLD.quality_tier
    OR NEW.offered_price IS DISTINCT FROM OLD.offered_price
    OR NEW.final_price IS DISTINCT FROM OLD.final_price
    OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
    OR NEW.delivery_deadline IS DISTINCT FROM OLD.delivery_deadline
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
    OR NEW.carrier IS DISTINCT FROM OLD.carrier
    OR NEW.shipped_at IS DISTINCT FROM OLD.shipped_at
    OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
    OR NEW.delivery_photo_url IS DISTINCT FROM OLD.delivery_photo_url
    OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
    OR NEW.stripe_transfer_id IS DISTINCT FROM OLD.stripe_transfer_id
    OR NEW.platform_fee_pct IS DISTINCT FROM OLD.platform_fee_pct
    OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
    OR NEW.notes IS DISTINCT FROM OLD.notes
  THEN
    RAISE EXCEPTION 'Companies can only sync quantity_needed on open material orders';
  END IF;

  IF NEW.quantity_needed IS NULL OR NEW.quantity_needed < 0 THEN
    RAISE EXCEPTION 'quantity_needed must be zero or greater';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_company_material_order_updates_trigger ON public.material_orders;

CREATE TRIGGER enforce_company_material_order_updates_trigger
  BEFORE UPDATE ON public.material_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_company_material_order_updates();
