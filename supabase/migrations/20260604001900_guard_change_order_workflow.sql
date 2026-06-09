-- Make change orders company-scoped and restrict direct client mutations to
-- the intended contractor-signature and homeowner approval/rejection flow.

ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

CREATE INDEX IF NOT EXISTS idx_change_orders_company
  ON public.change_orders(company_id);

UPDATE public.change_orders co
SET company_id = selected.company_id
FROM (
  SELECT
    co_inner.id AS change_order_id,
    COALESCE(
      (
        SELECT q.company_id
        FROM public.quotes q
        WHERE q.project_id = co_inner.project_id
          AND q.status = 'approved'
        ORDER BY q.approved_at DESC NULLS LAST, q.submitted_at DESC NULLS LAST
        LIMIT 1
      ),
      (
        SELECT p.assigned_company_id
        FROM public.projects p
        WHERE p.id = co_inner.project_id
      ),
      (
        SELECT ps.assigned_company_id
        FROM public.project_slots ps
        WHERE ps.project_id = co_inner.project_id
          AND ps.assigned_company_id IS NOT NULL
        ORDER BY ps.accepted_at DESC NULLS LAST, ps.created_at DESC NULLS LAST
        LIMIT 1
      )
    ) AS company_id
  FROM public.change_orders co_inner
) selected
WHERE co.id = selected.change_order_id
  AND co.company_id IS NULL
  AND selected.company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_company_project_participant(
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
    FROM public.quotes q
    WHERE q.project_id = p_project_id
      AND q.company_id = p_company_id
      AND q.status IN ('pending', 'approved')
  );
$$;

DROP POLICY IF EXISTS "change_orders_participants" ON public.change_orders;
DROP POLICY IF EXISTS "change_orders_select_participants" ON public.change_orders;
DROP POLICY IF EXISTS "change_orders_company_insert" ON public.change_orders;
DROP POLICY IF EXISTS "change_orders_participant_update" ON public.change_orders;

CREATE POLICY "change_orders_select_participants" ON public.change_orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = change_orders.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.user_id = (SELECT auth.uid())
        AND (
          c.id = change_orders.company_id
          OR (
            change_orders.company_id IS NULL
            AND public.is_company_project_participant(change_orders.project_id, c.id)
          )
        )
    )
  );

CREATE POLICY "change_orders_company_insert" ON public.change_orders
  FOR INSERT WITH CHECK (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = change_orders.company_id
        AND c.user_id = (SELECT auth.uid())
    )
    AND public.is_company_project_participant(project_id, company_id)
  );

CREATE POLICY "change_orders_participant_update" ON public.change_orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = change_orders.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = change_orders.company_id
        AND c.user_id = (SELECT auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = change_orders.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = change_orders.company_id
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_change_order_workflow()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_auth_uid UUID;
  v_is_homeowner boolean;
  v_is_company boolean;
BEGIN
  v_auth_uid := (SELECT auth.uid());

  -- Service-role edge functions and maintenance paths do not carry an end-user.
  IF v_auth_uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Change orders cannot be deleted from the client';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Change orders must be assigned to a contractor company';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = NEW.company_id
        AND c.user_id = v_auth_uid
    )
    INTO v_is_company;

    IF NOT v_is_company THEN
      RAISE EXCEPTION 'Contractors can only create change orders for their own company';
    END IF;

    IF NOT public.is_company_project_participant(NEW.project_id, NEW.company_id) THEN
      RAISE EXCEPTION 'Contractor is not assigned to this project';
    END IF;

    IF NEW.status <> 'proposed'
      OR NEW.signed_by_company IS DISTINCT FROM TRUE
      OR NEW.signed_by_homeowner IS DISTINCT FROM FALSE
    THEN
      RAISE EXCEPTION 'New change orders must be proposed and contractor-signed';
    END IF;

    IF NEW.description IS NULL OR length(trim(NEW.description)) = 0 THEN
      RAISE EXCEPTION 'Change order description is required';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.cost_delta IS DISTINCT FROM OLD.cost_delta
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Change order details cannot be edited after proposal';
  END IF;

  IF OLD.status <> 'proposed' THEN
    RAISE EXCEPTION 'Finalized change orders cannot be changed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = OLD.project_id
      AND p.homeowner_id = v_auth_uid
  )
  INTO v_is_homeowner;

  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = OLD.company_id
      AND c.user_id = v_auth_uid
  )
  INTO v_is_company;

  IF v_is_homeowner THEN
    IF OLD.signed_by_company IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Homeowners can only respond after the contractor signs';
    END IF;

    IF NEW.signed_by_company IS DISTINCT FROM OLD.signed_by_company THEN
      RAISE EXCEPTION 'Homeowners cannot change contractor signatures';
    END IF;

    IF OLD.signed_by_homeowner IS DISTINCT FROM TRUE
      AND NEW.signed_by_homeowner IS TRUE
      AND NEW.status = 'approved'
    THEN
      RETURN NEW;
    END IF;

    IF NEW.signed_by_homeowner IS NOT DISTINCT FROM OLD.signed_by_homeowner
      AND NEW.status = 'rejected'
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Homeowners can only approve/sign or reject contractor-signed change orders';
  END IF;

  IF v_is_company THEN
    IF OLD.signed_by_company IS TRUE THEN
      RAISE EXCEPTION 'Contractor has already signed this change order';
    END IF;

    IF NEW.signed_by_homeowner IS DISTINCT FROM OLD.signed_by_homeowner THEN
      RAISE EXCEPTION 'Contractors cannot change homeowner signatures';
    END IF;

    -- The CLI's SQL splitter mis-parses CASE inside IF conditions, so this
    -- is written as plain boolean logic with the same semantics:
    --   homeowner-signed -> contractor co-sign moves to 'approved'
    --   not signed        -> contractor signs first, status stays 'proposed'
    IF NEW.signed_by_company IS TRUE
      AND (
        (OLD.signed_by_homeowner IS TRUE AND NEW.status = 'approved')
        OR (OLD.signed_by_homeowner IS NOT TRUE AND NEW.status = 'proposed')
      )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Contractors can only sign their own proposed change orders';
  END IF;

  RAISE EXCEPTION 'Change order update is not permitted';
END;
$$;

DROP TRIGGER IF EXISTS enforce_change_order_workflow_trigger ON public.change_orders;

CREATE TRIGGER enforce_change_order_workflow_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.change_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_change_order_workflow();
