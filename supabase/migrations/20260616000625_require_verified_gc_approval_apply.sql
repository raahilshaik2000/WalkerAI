-- Pending GC recommendations should not apply project changes after a GC loses
-- WalkerAI verification, even if the assignment is still marked active.

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
         JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
        WHERE gcp.project_id = NEW.project_id
          AND gcp.general_contractor_id = NEW.requested_by_gc_id
          AND gcp.homeowner_id = NEW.homeowner_id
          AND gcp.status = 'active'
          AND gc.verified IS TRUE
     )
  THEN
    RAISE EXCEPTION 'Active verified GC management is required before this approval can apply project changes';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_gc_approval_apply_active_assignment() FROM PUBLIC, anon, authenticated;
