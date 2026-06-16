-- Require schedule readiness before a homeowner can approve GC project closeout.
-- This forward migration redefines the current closeout guard with the same
-- project/payment/material/trade checks plus an explicit filled-slot schedule
-- blocker.

CREATE OR REPLACE FUNCTION public.guard_gc_completion_approval_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status = 'pending'
     AND NEW.request_type = 'general_recommendation'
     AND NEW.metadata->>'action' = 'complete_project'
  THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.projects project
       WHERE project.id = NEW.project_id
         AND project.status = 'active'
         AND project.ai_cost_min > 0
         AND project.ai_cost_max > 0
    ) THEN
      RAISE EXCEPTION 'Project must be active with an approved budget before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.project_approval_requests request
       WHERE request.project_id = NEW.project_id
         AND request.id <> NEW.id
         AND request.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Resolve pending approval requests before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.gc_payment_requests payment
       WHERE payment.project_id = NEW.project_id
         AND payment.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Resolve pending GC payment requests before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.change_orders change_order
       WHERE change_order.project_id = NEW.project_id
         AND change_order.status = 'proposed'
         AND change_order.signed_by_company IS TRUE
         AND change_order.signed_by_homeowner IS NOT TRUE
    ) THEN
      RAISE EXCEPTION 'Resolve pending change orders before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.project_slots slot
       WHERE slot.project_id = NEW.project_id
         AND slot.status IN ('filled', 'scheduled')
         AND slot.scheduled_start_date IS NULL
    ) THEN
      RAISE EXCEPTION 'Resolve unscheduled trade slots before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.permits permit
       WHERE permit.project_id = NEW.project_id
         AND permit.status <> 'passed'
    ) THEN
      RAISE EXCEPTION 'Resolve open permits and inspections before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.material_orders material_order
       WHERE material_order.project_id = NEW.project_id
         AND material_order.status NOT IN ('confirmed', 'paid', 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Resolve active material orders before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.gc_trade_quote_negotiations negotiation
       WHERE negotiation.project_id = NEW.project_id
         AND negotiation.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Resolve pending trade pricing negotiations before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.quotes quote
       WHERE quote.project_id = NEW.project_id
         AND quote.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Resolve pending trade quotes before completing this GC-managed project';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.quotes quote
        JOIN public.milestones milestone
          ON milestone.quote_id = quote.id
       WHERE quote.project_id = NEW.project_id
         AND quote.status = 'approved'
         AND milestone.status <> 'paid'
    ) THEN
      RAISE EXCEPTION 'Resolve unpaid quote milestones before completing this GC-managed project';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_completion_approval_ready_trigger ON public.project_approval_requests;
CREATE TRIGGER guard_gc_completion_approval_ready_trigger
  BEFORE UPDATE OF status ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_completion_approval_ready();

REVOKE ALL ON FUNCTION public.guard_gc_completion_approval_ready() FROM PUBLIC, anon, authenticated;
