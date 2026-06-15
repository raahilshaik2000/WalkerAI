-- Homeowners can approve or reject GC recommendations, and GCs may cancel
-- pending recommendations. Neither side should be able to rewrite the request
-- body, cost/timeline impact, or workflow metadata after insertion because
-- those fields are the audit record of what the GC actually recommended.

CREATE OR REPLACE FUNCTION public.guard_gc_approval_request_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval request has already been responded to';
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.requested_by_gc_id IS DISTINCT FROM OLD.requested_by_gc_id
    OR NEW.homeowner_id IS DISTINCT FROM OLD.homeowner_id
    OR NEW.request_type IS DISTINCT FROM OLD.request_type
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.cost_delta IS DISTINCT FROM OLD.cost_delta
    OR NEW.timeline_delta_days IS DISTINCT FROM OLD.timeline_delta_days
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'GC approval request details cannot be changed after submission';
  END IF;

  IF NEW.status = OLD.status
    AND (
      NEW.response_note IS DISTINCT FROM OLD.response_note
      OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
    )
  THEN
    RAISE EXCEPTION 'Approval request response details require a status change';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_approval_request_updates_trigger ON public.project_approval_requests;
CREATE TRIGGER guard_gc_approval_request_updates_trigger
  BEFORE UPDATE ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_approval_request_updates();

REVOKE ALL ON FUNCTION public.guard_gc_approval_request_updates() FROM PUBLIC, anon, authenticated;
