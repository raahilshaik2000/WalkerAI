-- Final GC completion should not close a project while other homeowner
-- decisions are still open. The UI checks this before creating the completion
-- request; this trigger re-checks at approval time so stale or crafted
-- completion requests cannot bypass pending decisions.

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
