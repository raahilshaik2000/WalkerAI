-- GC-to-trade quote negotiation thread. This keeps trade pricing discussion
-- inside WalkerAI without changing homeowner-payable quote totals until the
-- company submits a proper revised quote/milestone package.

CREATE TABLE IF NOT EXISTS public.gc_trade_quote_negotiations (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slot_id                    UUID REFERENCES public.project_slots(id) ON DELETE SET NULL,
  quote_id                   UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  general_contractor_id      UUID NOT NULL REFERENCES public.general_contractors(id) ON DELETE CASCADE,
  company_id                 UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  homeowner_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  offer_amount_cents         INTEGER CHECK (offer_amount_cents IS NULL OR offer_amount_cents > 0),
  scope_note                 TEXT NOT NULL,
  status                     TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'accepted', 'rejected', 'revision_requested', 'cancelled')),
  company_response_note      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at               TIMESTAMPTZ,
  cancelled_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gc_trade_quote_negotiations_project_idx
  ON public.gc_trade_quote_negotiations(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS gc_trade_quote_negotiations_company_idx
  ON public.gc_trade_quote_negotiations(company_id, status, created_at DESC);

ALTER TABLE public.gc_trade_quote_negotiations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_trade_negotiations_select_participants" ON public.gc_trade_quote_negotiations;
CREATE POLICY "gc_trade_negotiations_select_participants" ON public.gc_trade_quote_negotiations
  FOR SELECT USING (
    homeowner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = gc_trade_quote_negotiations.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = gc_trade_quote_negotiations.company_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "gc_trade_negotiations_gc_insert" ON public.gc_trade_quote_negotiations;
CREATE POLICY "gc_trade_negotiations_gc_insert" ON public.gc_trade_quote_negotiations
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND NULLIF(TRIM(scope_note), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = gc_trade_quote_negotiations.project_id
       AND gcp.homeowner_id = gc_trade_quote_negotiations.homeowner_id
       AND gcp.status = 'active'
      JOIN public.quotes q
        ON q.id = gc_trade_quote_negotiations.quote_id
       AND q.project_id = gc_trade_quote_negotiations.project_id
       AND q.company_id = gc_trade_quote_negotiations.company_id
       AND q.status = 'pending'
      WHERE gc.id = gc_trade_quote_negotiations.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
    AND (
      gc_trade_quote_negotiations.slot_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.project_slots ps
        WHERE ps.id = gc_trade_quote_negotiations.slot_id
          AND ps.project_id = gc_trade_quote_negotiations.project_id
          AND ps.assigned_company_id = gc_trade_quote_negotiations.company_id
      )
    )
  );

DROP POLICY IF EXISTS "gc_trade_negotiations_gc_cancel" ON public.gc_trade_quote_negotiations;
CREATE POLICY "gc_trade_negotiations_gc_cancel" ON public.gc_trade_quote_negotiations
  FOR UPDATE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = gc_trade_quote_negotiations.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status = 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = gc_trade_quote_negotiations.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.respond_to_gc_trade_quote_negotiation(
  p_negotiation_id UUID,
  p_status TEXT,
  p_response_note TEXT DEFAULT NULL
)
RETURNS public.gc_trade_quote_negotiations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_negotiation public.gc_trade_quote_negotiations%ROWTYPE;
BEGIN
  IF p_status NOT IN ('accepted', 'rejected', 'revision_requested') THEN
    RAISE EXCEPTION 'Negotiation response must be accepted, rejected, or revision_requested';
  END IF;

  SELECT *
    INTO v_negotiation
    FROM public.gc_trade_quote_negotiations
   WHERE id = p_negotiation_id
     AND status = 'pending'
   FOR UPDATE;

  IF v_negotiation.id IS NULL THEN
    RAISE EXCEPTION 'Pending trade negotiation not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = v_negotiation.company_id
      AND c.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only the quoted company can respond to this negotiation';
  END IF;

  UPDATE public.gc_trade_quote_negotiations
     SET status = p_status,
         company_response_note = NULLIF(TRIM(COALESCE(p_response_note, '')), ''),
         responded_at = NOW()
   WHERE id = p_negotiation_id
   RETURNING * INTO v_negotiation;

  RETURN v_negotiation;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_gc_trade_negotiation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_user_id UUID;
  v_gc_name TEXT;
BEGIN
  SELECT user_id
    INTO v_company_user_id
    FROM public.companies
   WHERE id = NEW.company_id;

  SELECT business_name
    INTO v_gc_name
    FROM public.general_contractors
   WHERE id = NEW.general_contractor_id;

  PERFORM public.insert_gc_workflow_notification(
    v_company_user_id,
    'gc_trade_negotiation_requested',
    jsonb_build_object(
      'project_id', NEW.project_id,
      'slot_id', NEW.slot_id,
      'quote_id', NEW.quote_id,
      'trade_negotiation_id', NEW.id,
      'offer_amount_cents', NEW.offer_amount_cents,
      'general_contractor_id', NEW.general_contractor_id,
      'general_contractor_name', v_gc_name
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_gc_trade_negotiation_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gc_user_id UUID;
  v_company_name TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     AND OLD.status = 'pending'
     AND NEW.status IN ('accepted', 'rejected', 'revision_requested') THEN
    SELECT user_id
      INTO v_gc_user_id
      FROM public.general_contractors
     WHERE id = NEW.general_contractor_id;

    SELECT name
      INTO v_company_name
      FROM public.companies
     WHERE id = NEW.company_id;

    PERFORM public.insert_gc_workflow_notification(
      v_gc_user_id,
      'gc_trade_negotiation_responded',
      jsonb_build_object(
        'project_id', NEW.project_id,
        'slot_id', NEW.slot_id,
        'quote_id', NEW.quote_id,
        'trade_negotiation_id', NEW.id,
        'offer_amount_cents', NEW.offer_amount_cents,
        'status', NEW.status,
        'company_id', NEW.company_id,
        'company_name', v_company_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gc_trade_negotiation_insert_notification ON public.gc_trade_quote_negotiations;
CREATE TRIGGER gc_trade_negotiation_insert_notification
  AFTER INSERT ON public.gc_trade_quote_negotiations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_trade_negotiation_insert();

DROP TRIGGER IF EXISTS gc_trade_negotiation_response_notification ON public.gc_trade_quote_negotiations;
CREATE TRIGGER gc_trade_negotiation_response_notification
  AFTER UPDATE OF status ON public.gc_trade_quote_negotiations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_gc_trade_negotiation_response();

REVOKE ALL ON FUNCTION public.respond_to_gc_trade_quote_negotiation(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_gc_trade_quote_negotiation(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_trade_negotiation_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_gc_trade_negotiation_response() FROM PUBLIC, anon, authenticated;
