-- Homeowner-approved GC project completion should surface the same completion
-- and review prompts as the normal final-milestone closeout path.

CREATE OR REPLACE FUNCTION public.notify_gc_completion_approval()
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
    INSERT INTO public.notifications (user_id, type, payload)
    VALUES (
      NEW.homeowner_id,
      'project_complete',
      jsonb_build_object(
        'project_id', NEW.project_id,
        'message', 'Your GC-managed renovation is complete. Review your digital project binder and leave reviews.',
        'deep_link', '/(homeowner)/project/' || NEW.project_id::text
      )
    );

    INSERT INTO public.notifications (user_id, type, payload)
    SELECT DISTINCT company.user_id,
           'project_complete',
           jsonb_build_object(
             'project_id', NEW.project_id,
             'message', 'Project complete. Leave a review for this homeowner.',
             'deep_link', '/(company)/job/' || NEW.project_id::text || '/review'
           )
      FROM public.quotes quote
      JOIN public.companies company ON company.id = quote.company_id
     WHERE quote.project_id = NEW.project_id
       AND quote.status = 'approved'
       AND company.user_id IS NOT NULL
       AND company.user_id <> NEW.homeowner_id;

    INSERT INTO public.notifications (user_id, type, payload)
    SELECT DISTINCT gc.user_id,
           'project_complete',
           jsonb_build_object(
             'project_id', NEW.project_id,
             'message', 'The homeowner approved final GC project completion.',
             'deep_link', '/(general-contractor)/project/' || NEW.project_id::text || '/completion'
           )
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
     WHERE gcp.project_id = NEW.project_id
       AND gcp.general_contractor_id = NEW.requested_by_gc_id
       AND gcp.homeowner_id = NEW.homeowner_id
       AND gcp.status IN ('active', 'completed')
       AND gc.user_id IS NOT NULL
       AND gc.user_id <> NEW.homeowner_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_gc_completion_approval_trigger ON public.project_approval_requests;
CREATE TRIGGER notify_gc_completion_approval_trigger
  AFTER UPDATE OF status ON public.project_approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_completion_approval();

REVOKE ALL ON FUNCTION public.notify_gc_completion_approval() FROM PUBLIC, anon, authenticated;
