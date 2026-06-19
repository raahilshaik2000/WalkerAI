-- Keep multi-trade projects dispatchable while only some slots have quotes.
-- A pending quote for the first accepted slot should not move the entire
-- project to quoting because accept-job requires dispatching while other
-- dispatched slots are still open.

CREATE OR REPLACE FUNCTION public.sync_project_status_on_quote_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    UPDATE public.projects project
    SET status = 'quoting'
    WHERE project.id = NEW.project_id
      AND (
        project.status IN ('accepted', 'scheduling')
        OR (
          project.status = 'dispatching'
          AND NOT EXISTS (
            SELECT 1
            FROM public.project_slots slot
            WHERE slot.project_id = project.id
              AND slot.status NOT IN ('filled', 'scheduled')
          )
        )
      );
  END IF;

  RETURN NEW;
END;
$$;
