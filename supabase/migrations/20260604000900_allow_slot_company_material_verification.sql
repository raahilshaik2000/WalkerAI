-- Allow companies assigned through trade slots to verify material quantities.
-- Also restrict company-side material updates to verification fields only.

DROP POLICY IF EXISTS "materials_update_assigned_company" ON public.materials;
DROP POLICY IF EXISTS "materials_update_company_verification" ON public.materials;

CREATE POLICY "materials_update_company_verification" ON public.materials
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = materials.project_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = materials.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      JOIN public.companies c ON c.id = p.assigned_company_id
      WHERE p.id = materials.project_id
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = materials.project_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_company_material_verification_updates()
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

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.item IS DISTINCT FROM OLD.item
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit IS DISTINCT FROM OLD.unit
    OR NEW.quality_tier IS DISTINCT FROM OLD.quality_tier
    OR NEW.order_status IS DISTINCT FROM OLD.order_status
    OR NEW.material_order_id IS DISTINCT FROM OLD.material_order_id
    OR NEW.supplier_notes IS DISTINCT FROM OLD.supplier_notes
  THEN
    RAISE EXCEPTION 'Companies can only update material verification fields';
  END IF;

  IF NEW.verified_by IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'verified_by must match the authenticated company user';
  END IF;

  IF NEW.verified_quantity IS NULL OR NEW.verified_quantity < 0 THEN
    RAISE EXCEPTION 'verified_quantity must be zero or greater';
  END IF;

  IF NEW.verified_at IS NULL THEN
    RAISE EXCEPTION 'verified_at is required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_company_material_verification_updates_trigger ON public.materials;

CREATE TRIGGER enforce_company_material_verification_updates_trigger
  BEFORE UPDATE ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_company_material_verification_updates();
