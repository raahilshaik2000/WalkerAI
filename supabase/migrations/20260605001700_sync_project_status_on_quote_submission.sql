-- Keep homeowner project lists in sync when an assigned contractor submits a quote.
-- Company clients can insert quotes through RLS, but cannot update projects directly.

CREATE OR REPLACE FUNCTION public.sync_project_status_on_quote_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    UPDATE public.projects
    SET status = 'quoting'
    WHERE id = NEW.project_id
      AND status IN ('dispatching', 'accepted', 'scheduling');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_project_status_on_quote_submission_trigger ON public.quotes;

CREATE TRIGGER sync_project_status_on_quote_submission_trigger
  AFTER INSERT OR UPDATE OF status ON public.quotes
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.sync_project_status_on_quote_submission();
