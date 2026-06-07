-- Link contractor quotes to the specific trade slot they price.
-- Legacy single-contractor quotes keep slot_id NULL.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES public.project_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_slot ON public.quotes(slot_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_one_open_per_slot
  ON public.quotes(slot_id, company_id)
  WHERE slot_id IS NOT NULL
    AND status IN ('pending', 'approved');

CREATE OR REPLACE FUNCTION public.enforce_quote_slot_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_project_id UUID;
  v_slot_company_id UUID;
  v_slot_status TEXT;
BEGIN
  IF NEW.slot_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project_id, assigned_company_id, status
  INTO v_slot_project_id, v_slot_company_id, v_slot_status
  FROM public.project_slots
  WHERE id = NEW.slot_id;

  IF v_slot_project_id IS NULL THEN
    RAISE EXCEPTION 'Quote slot does not exist';
  END IF;

  IF v_slot_project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'Quote slot must belong to the quoted project';
  END IF;

  IF v_slot_company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Quote slot must be assigned to the quoting company';
  END IF;

  IF v_slot_status NOT IN ('filled', 'scheduled') THEN
    RAISE EXCEPTION 'Quote slot must be accepted before quoting';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_quote_slot_assignment_trigger ON public.quotes;
CREATE TRIGGER enforce_quote_slot_assignment_trigger
  BEFORE INSERT OR UPDATE OF slot_id, project_id, company_id ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_quote_slot_assignment();

CREATE OR REPLACE FUNCTION public.is_company_assigned_to_project(
  p_project_id UUID,
  p_company_id UUID
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.assigned_company_id = p_company_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.project_slots ps
    WHERE ps.project_id = p_project_id
      AND ps.assigned_company_id = p_company_id
      AND ps.status IN ('filled', 'scheduled')
  )
  OR EXISTS (
    SELECT 1
    FROM public.dispatch_logs dl
    WHERE dl.project_id = p_project_id
      AND dl.company_id = p_company_id
      AND dl.response = 'accepted'
  )
  OR EXISTS (
    SELECT 1
    FROM public.dispatch_logs dl
    JOIN public.project_slots ps ON ps.id = dl.slot_id
    WHERE ps.project_id = p_project_id
      AND dl.company_id = p_company_id
      AND dl.response = 'accepted'
  );
$$;
