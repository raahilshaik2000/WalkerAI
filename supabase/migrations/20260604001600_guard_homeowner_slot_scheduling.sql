-- Limit direct homeowner project_slot writes to schedule confirmation fields.
-- Slot creation/assignment/dispatch is handled by service-role edge functions.

DROP POLICY IF EXISTS "slots_homeowner" ON public.project_slots;
DROP POLICY IF EXISTS "slots_homeowner_read" ON public.project_slots;
DROP POLICY IF EXISTS "slots_homeowner_schedule" ON public.project_slots;

CREATE POLICY "slots_homeowner_read" ON public.project_slots
  FOR SELECT TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE homeowner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "slots_homeowner_schedule" ON public.project_slots
  FOR UPDATE TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE homeowner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE homeowner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_homeowner_slot_scheduling_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_homeowner boolean;
BEGIN
  -- Service-role edge functions and maintenance paths do not have auth.uid().
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = OLD.project_id
      AND p.homeowner_id = (SELECT auth.uid())
  )
  INTO v_is_homeowner;

  IF NOT v_is_homeowner THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.trade_type IS DISTINCT FROM OLD.trade_type
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.estimated_cost_min IS DISTINCT FROM OLD.estimated_cost_min
    OR NEW.estimated_cost_max IS DISTINCT FROM OLD.estimated_cost_max
    OR NEW.assigned_company_id IS DISTINCT FROM OLD.assigned_company_id
    OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Homeowners can only update scheduled dates and scheduling status for trade slots';
  END IF;

  IF OLD.status NOT IN ('filled', 'scheduled') OR NEW.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Homeowners can only schedule filled trade slots';
  END IF;

  IF NEW.scheduled_start_date IS NULL THEN
    RAISE EXCEPTION 'Scheduled start date is required';
  END IF;

  IF NEW.scheduled_end_date IS NOT NULL AND NEW.scheduled_end_date < NEW.scheduled_start_date THEN
    RAISE EXCEPTION 'Scheduled end date cannot be before scheduled start date';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_homeowner_slot_scheduling_updates_trigger ON public.project_slots;

CREATE TRIGGER enforce_homeowner_slot_scheduling_updates_trigger
  BEFORE UPDATE ON public.project_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_homeowner_slot_scheduling_updates();
