-- Prevent duplicate pending homeowner approval requests for the same GC-managed
-- project target. This protects homeowners from repeated schedule/material/trade
-- prompts if a GC taps twice, retries from another device, or an older pending
-- request has not been resolved yet.

CREATE OR REPLACE FUNCTION public.guard_project_approval_request_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_target_key TEXT;
  v_target_value TEXT;
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

  IF NEW.request_type IN ('schedule_change', 'trade_substitution', 'material_substitution') THEN
    v_target_key := CASE
      WHEN NEW.request_type IN ('schedule_change', 'trade_substitution') THEN 'slot_id'
      WHEN NEW.request_type = 'material_substitution' THEN 'material_id'
    END;
    v_target_value := NULLIF(TRIM(COALESCE(NEW.metadata->>v_target_key, '')), '');

    IF v_target_value IS NULL THEN
      RAISE EXCEPTION 'Target metadata is required for this GC approval request';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.project_approval_requests request
       WHERE request.project_id = NEW.project_id
         AND request.requested_by_gc_id = NEW.requested_by_gc_id
         AND request.homeowner_id = NEW.homeowner_id
         AND request.status = 'pending'
         AND request.request_type = NEW.request_type
         AND request.metadata->>v_target_key = v_target_value
    ) THEN
      RAISE EXCEPTION 'Resolve the existing pending GC request for this target before submitting another';
    END IF;
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
