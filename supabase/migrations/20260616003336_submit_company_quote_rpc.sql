-- Submit or replace an unfunded company quote atomically.
-- The mobile client previously deleted a pending quote, inserted the new
-- quote, then inserted milestones and line items as separate requests. A
-- network/RLS failure in the middle could leave pricing in a partial state.

CREATE OR REPLACE FUNCTION public.submit_company_quote(
  p_project_id UUID,
  p_slot_id UUID,
  p_total_amount INTEGER,
  p_milestones JSONB,
  p_line_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_company_id UUID;
  v_homeowner_id UUID;
  v_quote_id UUID;
  v_milestone_total INTEGER;
  v_priced_line_items INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in required before submitting a quote';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required before submitting a quote';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Quote total must be greater than zero';
  END IF;

  IF jsonb_typeof(p_milestones) IS DISTINCT FROM 'array' OR jsonb_array_length(p_milestones) = 0 THEN
    RAISE EXCEPTION 'At least one payment milestone is required';
  END IF;

  IF jsonb_typeof(p_line_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'At least one quote line item is required';
  END IF;

  SELECT id
  INTO v_company_id
  FROM public.companies
  WHERE user_id = v_user_id
    AND verified = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Only verified companies can submit quotes';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(
    p_project_id::TEXT || ':' || v_company_id::TEXT || ':' || COALESCE(p_slot_id::TEXT, 'project')
  ));

  IF p_slot_id IS NULL THEN
    SELECT homeowner_id
    INTO v_homeowner_id
    FROM public.projects
    WHERE id = p_project_id
      AND assigned_company_id = v_company_id;

    IF v_homeowner_id IS NULL THEN
      RAISE EXCEPTION 'You can only submit a project quote after accepting this project';
    END IF;
  ELSE
    SELECT p.homeowner_id
    INTO v_homeowner_id
    FROM public.project_slots ps
    JOIN public.projects p ON p.id = ps.project_id
    WHERE ps.id = p_slot_id
      AND ps.project_id = p_project_id
      AND ps.assigned_company_id = v_company_id
      AND ps.status IN ('filled', 'scheduled');

    IF v_homeowner_id IS NULL THEN
      RAISE EXCEPTION 'You can only submit a trade quote after accepting this trade slot';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotes q
    WHERE q.project_id = p_project_id
      AND q.company_id = v_company_id
      AND q.status = 'approved'
      AND (
        (p_slot_id IS NULL AND q.slot_id IS NULL)
        OR q.slot_id = p_slot_id
      )
  ) THEN
    RAISE EXCEPTION 'This trade already has a paid quote from your company';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quotes q
    WHERE q.project_id = p_project_id
      AND q.company_id = v_company_id
      AND q.status = 'pending'
      AND q.stripe_payment_intent_id IS NOT NULL
      AND (
        (p_slot_id IS NULL AND q.slot_id IS NULL)
        OR q.slot_id = p_slot_id
      )
  ) THEN
    RAISE EXCEPTION 'The homeowner has already started payment for this quote. Ask them to reject it before submitting a revision.';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_milestone_total
  FROM jsonb_to_recordset(p_milestones) AS milestone(
    title TEXT,
    amount INTEGER,
    due_date TEXT
  );

  IF ABS(v_milestone_total - p_total_amount) > 1 THEN
    RAISE EXCEPTION 'Milestone total must match the quote total';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_milestones) AS milestone(
      title TEXT,
      amount INTEGER,
      due_date TEXT
    )
    WHERE NULLIF(trim(COALESCE(title, '')), '') IS NULL
      OR amount IS NULL
      OR amount <= 0
  ) THEN
    RAISE EXCEPTION 'Every milestone needs a title and positive amount';
  END IF;

  SELECT COUNT(*)
  INTO v_priced_line_items
  FROM jsonb_to_recordset(p_line_items) AS line_item(
    type TEXT,
    description TEXT,
    quantity NUMERIC,
    unit TEXT,
    unit_cost INTEGER,
    total_cost INTEGER
  )
  WHERE total_cost IS NOT NULL
    AND total_cost > 0;

  IF v_priced_line_items = 0 THEN
    RAISE EXCEPTION 'At least one priced quote line item is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_line_items) AS line_item(
      type TEXT,
      description TEXT,
      quantity NUMERIC,
      unit TEXT,
      unit_cost INTEGER,
      total_cost INTEGER
    )
    WHERE type NOT IN ('labour', 'material', 'other')
      OR NULLIF(trim(COALESCE(description, '')), '') IS NULL
      OR COALESCE(quantity, 0) <= 0
      OR (unit_cost IS NOT NULL AND unit_cost < 0)
      OR (total_cost IS NOT NULL AND total_cost < 0)
  ) THEN
    RAISE EXCEPTION 'Quote line items must include valid type, description, quantity, and amounts';
  END IF;

  DELETE FROM public.quotes q
  WHERE q.project_id = p_project_id
    AND q.company_id = v_company_id
    AND q.status = 'pending'
    AND q.stripe_payment_intent_id IS NULL
    AND (
      (p_slot_id IS NULL AND q.slot_id IS NULL)
      OR q.slot_id = p_slot_id
    );

  INSERT INTO public.quotes (
    project_id,
    company_id,
    slot_id,
    total_amount,
    status,
    submitted_at
  )
  VALUES (
    p_project_id,
    v_company_id,
    p_slot_id,
    p_total_amount,
    'pending',
    NOW()
  )
  RETURNING id INTO v_quote_id;

  INSERT INTO public.milestones (
    quote_id,
    title,
    amount,
    status,
    sort_order,
    due_date
  )
  SELECT
    v_quote_id,
    trim(milestone.title),
    milestone.amount,
    'pending',
    milestone.sort_order,
    NULLIF(trim(COALESCE(milestone.due_date, '')), '')::DATE
  FROM jsonb_to_recordset(p_milestones) AS milestone(
    title TEXT,
    amount INTEGER,
    due_date TEXT,
    sort_order INTEGER
  )
  ORDER BY milestone.sort_order NULLS LAST;

  INSERT INTO public.quote_line_items (
    quote_id,
    type,
    description,
    quantity,
    unit,
    unit_cost,
    total_cost,
    sort_order
  )
  SELECT
    v_quote_id,
    line_item.type,
    trim(line_item.description),
    COALESCE(line_item.quantity, 1),
    NULLIF(trim(COALESCE(line_item.unit, '')), ''),
    line_item.unit_cost,
    line_item.total_cost,
    line_item.sort_order
  FROM jsonb_to_recordset(p_line_items) AS line_item(
    type TEXT,
    description TEXT,
    quantity NUMERIC,
    unit TEXT,
    unit_cost INTEGER,
    total_cost INTEGER,
    sort_order INTEGER
  )
  ORDER BY line_item.sort_order NULLS LAST;

  BEGIN
    INSERT INTO public.notifications (
      user_id,
      type,
      payload
    )
    VALUES (
      v_homeowner_id,
      'quote_submitted',
      jsonb_build_object(
        'project_id', p_project_id,
        'quote_id', v_quote_id,
        'slot_id', p_slot_id,
        'total_amount', p_total_amount,
        'deep_link', '/(homeowner)/project/' || p_project_id::TEXT || '/quote'
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'quote_submitted notification failed for quote %: %', v_quote_id, SQLERRM;
  END;

  RETURN v_quote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_company_quote(UUID, UUID, INTEGER, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_company_quote(UUID, UUID, INTEGER, JSONB, JSONB) TO authenticated;
