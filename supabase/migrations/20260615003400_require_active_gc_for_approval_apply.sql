-- Workflow-applying GC approval requests should only apply while that GC still
-- has an active management assignment. This prevents stale pending requests from
-- changing schedule, materials, trades, budgets, terms, or completion after a GC
-- is removed from the project.

CREATE OR REPLACE FUNCTION public.guard_gc_approval_apply_active_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status = 'pending'
     AND (
       NEW.request_type IN ('schedule_change', 'material_substitution', 'trade_substitution')
       OR (
         NEW.request_type = 'general_recommendation'
         AND NEW.metadata->>'action' IN ('update_gc_budget', 'update_gc_terms', 'complete_project')
       )
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.general_contractor_projects gcp
        WHERE gcp.project_id = NEW.project_id
          AND gcp.general_contractor_id = NEW.requested_by_gc_id
          AND gcp.homeowner_id = NEW.homeowner_id
          AND gcp.status = 'active'
     )
  THEN
    RAISE EXCEPTION 'Active GC management is required before this approval can apply project changes';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_approval_apply_active_assignment_trigger ON public.project_approval_requests;
CREATE TRIGGER guard_gc_approval_apply_active_assignment_trigger
  BEFORE UPDATE OF status ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_approval_apply_active_assignment();

REVOKE ALL ON FUNCTION public.guard_gc_approval_apply_active_assignment() FROM PUBLIC, anon, authenticated;
