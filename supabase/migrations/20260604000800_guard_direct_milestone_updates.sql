-- Restrict direct client milestone updates to contractor progress transitions.
-- Homeowner approval, payout fields, and project completion remain controlled by edge functions.

CREATE OR REPLACE FUNCTION public.enforce_direct_milestone_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_quote_company boolean;
BEGIN
  -- Service-role edge functions do not carry an end-user auth.uid().
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.quotes q
    JOIN public.companies c ON c.id = q.company_id
    WHERE q.id = OLD.quote_id
      AND c.user_id = (SELECT auth.uid())
  )
  INTO v_is_quote_company;

  IF NOT v_is_quote_company THEN
    RAISE EXCEPTION 'Milestones can only be updated through the approved workflow';
  END IF;

  IF NEW.quote_id IS DISTINCT FROM OLD.quote_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
    OR NEW.stripe_transfer_id IS DISTINCT FROM OLD.stripe_transfer_id
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
  THEN
    RAISE EXCEPTION 'Contractors can only update milestone work status';
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status = 'started')
    OR (OLD.status = 'started' AND NEW.status = 'in_progress')
    OR (OLD.status = 'in_progress' AND NEW.status = 'completed')
  ) THEN
    RAISE EXCEPTION 'Invalid contractor milestone status transition';
  END IF;

  IF OLD.status = 'in_progress' AND NEW.status = 'completed' THEN
    IF NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'completed_at is required when marking a milestone complete';
    END IF;
  ELSIF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'completed_at can only be set when marking a milestone complete';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_direct_milestone_updates_trigger ON public.milestones;

CREATE TRIGGER enforce_direct_milestone_updates_trigger
  BEFORE UPDATE ON public.milestones
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_direct_milestone_updates();
