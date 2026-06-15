-- Approval request statuses are actor-specific:
-- homeowners approve/reject, while the requesting GC may cancel a pending
-- recommendation. This closes the broad homeowner update policy so
-- "cancelled" cannot be used as a homeowner response.

CREATE OR REPLACE FUNCTION public.guard_gc_approval_request_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_homeowner BOOLEAN;
  v_is_requesting_gc BOOLEAN;
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

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_is_homeowner := OLD.homeowner_id = (SELECT auth.uid());

    SELECT EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = OLD.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
    )
    INTO v_is_requesting_gc;

    IF NEW.status IN ('approved', 'rejected') THEN
      IF NOT v_is_homeowner THEN
        RAISE EXCEPTION 'Only the homeowner can approve or reject a GC approval request';
      END IF;
      IF NEW.responded_at IS NULL THEN
        RAISE EXCEPTION 'Approval request responses must include a response timestamp';
      END IF;
    ELSIF NEW.status = 'cancelled' THEN
      IF NOT v_is_requesting_gc THEN
        RAISE EXCEPTION 'Only the requesting GC can cancel a GC approval request';
      END IF;
    ELSIF NEW.status = 'pending' THEN
      RAISE EXCEPTION 'Approval request status cannot be reset to pending';
    ELSE
      RAISE EXCEPTION 'Unsupported approval request status transition';
    END IF;
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
