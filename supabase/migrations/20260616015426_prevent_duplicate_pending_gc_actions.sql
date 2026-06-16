-- Action-backed GC recommendations should not have more than one open
-- homeowner decision for the same project and GC. Otherwise an older pending
-- budget, terms, or completion request can be approved after a newer request
-- and apply stale project state.

CREATE OR REPLACE FUNCTION public.guard_project_approval_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'pending'
    OR NEW.response_note IS NOT NULL
    OR NEW.responded_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'GC approval requests must start pending without response details';
  END IF;

  IF NULLIF(TRIM(NEW.title), '') IS NULL THEN
    RAISE EXCEPTION 'GC approval request title is required';
  END IF;

  v_action := COALESCE(NEW.metadata->>'action', '');
  IF NEW.request_type = 'general_recommendation'
     AND v_action IN ('update_gc_budget', 'update_gc_terms', 'complete_project')
     AND EXISTS (
       SELECT 1
         FROM public.project_approval_requests request
        WHERE request.project_id = NEW.project_id
          AND request.requested_by_gc_id = NEW.requested_by_gc_id
          AND request.homeowner_id = NEW.homeowner_id
          AND request.status = 'pending'
          AND request.request_type = 'general_recommendation'
          AND request.metadata->>'action' = v_action
     )
  THEN
    RAISE EXCEPTION 'Resolve the existing pending GC recommendation before submitting another request for this action';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_approval_request_insert_trigger ON public.project_approval_requests;
CREATE TRIGGER guard_project_approval_request_insert_trigger
  BEFORE INSERT ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_approval_request_insert();

REVOKE ALL ON FUNCTION public.guard_project_approval_request_insert() FROM PUBLIC, anon, authenticated;
