-- Keep project completion timestamps consistent across GC and non-GC flows.
-- The GC approval RPC updates projects.status directly, so this trigger makes
-- the timestamp invariant database-owned instead of screen-owned.

CREATE OR REPLACE FUNCTION public.set_project_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed')
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_project_completed_at_trigger ON public.projects;
CREATE TRIGGER set_project_completed_at_trigger
  BEFORE INSERT OR UPDATE OF status ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_completed_at();

UPDATE public.projects
   SET completed_at = NOW()
 WHERE status = 'completed'
   AND completed_at IS NULL;

REVOKE ALL ON FUNCTION public.set_project_completed_at() FROM PUBLIC, anon, authenticated;
