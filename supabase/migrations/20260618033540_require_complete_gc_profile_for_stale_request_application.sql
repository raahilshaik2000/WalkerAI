-- Pending GC-originated requests can be acted on later by homeowners or trades.
-- Re-check the same complete verified GC readiness at application time so a
-- stale request cannot apply after the GC profile becomes incomplete or the
-- account role is no longer a real general_contractor.

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
         JOIN public.users u ON u.id = gc.user_id
        WHERE gcp.project_id = NEW.project_id
          AND gcp.general_contractor_id = NEW.requested_by_gc_id
          AND gcp.homeowner_id = NEW.homeowner_id
          AND gcp.status = 'active'
          AND u.role = 'general_contractor'
          AND gc.verified IS TRUE
          AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
          AND NULLIF(TRIM(gc.city), '') IS NOT NULL
          AND NULLIF(TRIM(gc.province), '') IS NOT NULL
          AND gc.lat IS NOT NULL
          AND gc.lng IS NOT NULL
          AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
          AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
          AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'Active complete verified GC management is required before this approval can apply project changes';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_gc_approval_apply_active_assignment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_gc_payment_request_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment request has already been responded to';
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.general_contractor_id IS DISTINCT FROM OLD.general_contractor_id
    OR NEW.homeowner_id IS DISTINCT FROM OLD.homeowner_id
    OR NEW.request_kind IS DISTINCT FROM OLD.request_kind
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'GC payment request details cannot be changed after submission';
  END IF;

  IF NEW.status IN ('approved', 'rejected') THEN
    IF NEW.homeowner_id <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'Only the homeowner can approve or reject a GC payment request';
    END IF;

    IF NEW.status = 'approved'
       AND NOT EXISTS (
         SELECT 1
           FROM public.general_contractor_projects gcp
           JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
           JOIN public.users u ON u.id = gc.user_id
          WHERE gcp.project_id = OLD.project_id
            AND gcp.general_contractor_id = OLD.general_contractor_id
            AND gcp.homeowner_id = OLD.homeowner_id
            AND gcp.status = 'active'
            AND u.role = 'general_contractor'
            AND gc.verified IS TRUE
            AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
            AND NULLIF(TRIM(gc.city), '') IS NOT NULL
            AND NULLIF(TRIM(gc.province), '') IS NOT NULL
            AND gc.lat IS NOT NULL
            AND gc.lng IS NOT NULL
            AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
            AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
            AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
       )
    THEN
      RAISE EXCEPTION 'Active complete verified GC management is required before approving a GC payment request';
    END IF;

    IF NEW.responded_at IS NULL THEN
      RAISE EXCEPTION 'GC payment request responses must include a response timestamp';
    END IF;

    IF NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC payment request responses cannot include cancellation details';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = OLD.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Only the requesting GC can cancel a GC payment request';
    END IF;

    IF NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'GC payment request cancellations must include a cancellation timestamp';
    END IF;

    IF NEW.response_note IS NOT NULL OR NEW.responded_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC payment request cancellations cannot include response details';
    END IF;
  ELSIF NEW.status = 'pending' THEN
    RAISE EXCEPTION 'GC payment request status cannot be reset to pending';
  ELSE
    RAISE EXCEPTION 'Invalid GC payment request status transition';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_gc_payment_request_updates() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    IF NEW.project_id IS NOT DISTINCT FROM OLD.project_id
      AND NEW.slot_id IS NOT DISTINCT FROM OLD.slot_id
      AND NEW.general_contractor_id IS NOT DISTINCT FROM OLD.general_contractor_id
      AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
      AND NEW.homeowner_id IS NOT DISTINCT FROM OLD.homeowner_id
      AND NEW.offer_amount_cents IS NOT DISTINCT FROM OLD.offer_amount_cents
      AND NEW.scope_note IS NOT DISTINCT FROM OLD.scope_note
      AND NEW.status IS NOT DISTINCT FROM OLD.status
      AND NEW.company_response_note IS NOT DISTINCT FROM OLD.company_response_note
      AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
      AND NEW.responded_at IS NOT DISTINCT FROM OLD.responded_at
      AND NEW.cancelled_at IS NOT DISTINCT FROM OLD.cancelled_at
      AND EXISTS (
        SELECT 1
          FROM public.quotes q
         WHERE q.id = NEW.quote_id
           AND q.project_id = OLD.project_id
           AND q.company_id = OLD.company_id
           AND q.status = 'pending'
           AND (
             (OLD.slot_id IS NULL AND q.slot_id IS NULL)
             OR q.slot_id = OLD.slot_id
           )
      )
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'GC trade negotiation quote links can only move to a replacement pending quote for the same trade';
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Trade negotiation has already been responded to';
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.slot_id IS DISTINCT FROM OLD.slot_id
    OR NEW.general_contractor_id IS DISTINCT FROM OLD.general_contractor_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
    OR NEW.homeowner_id IS DISTINCT FROM OLD.homeowner_id
    OR NEW.offer_amount_cents IS DISTINCT FROM OLD.offer_amount_cents
    OR NEW.scope_note IS DISTINCT FROM OLD.scope_note
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'GC trade negotiation details cannot be changed after submission';
  END IF;

  IF NEW.status IN ('accepted', 'rejected', 'revision_requested') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = OLD.company_id
        AND c.user_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Only the quoted company can respond to a GC trade negotiation';
    END IF;

    IF NEW.status = 'accepted'
       AND NOT EXISTS (
         SELECT 1
           FROM public.general_contractor_projects gcp
           JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
           JOIN public.users u ON u.id = gc.user_id
          WHERE gcp.project_id = OLD.project_id
            AND gcp.general_contractor_id = OLD.general_contractor_id
            AND gcp.homeowner_id = OLD.homeowner_id
            AND gcp.status = 'active'
            AND u.role = 'general_contractor'
            AND gc.verified IS TRUE
            AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
            AND NULLIF(TRIM(gc.city), '') IS NOT NULL
            AND NULLIF(TRIM(gc.province), '') IS NOT NULL
            AND gc.lat IS NOT NULL
            AND gc.lng IS NOT NULL
            AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
            AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
            AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
       )
    THEN
      RAISE EXCEPTION 'Active complete verified GC management is required before accepting a GC trade negotiation';
    END IF;

    IF NEW.status = 'accepted'
       AND NOT EXISTS (
         SELECT 1
           FROM public.quotes q
          WHERE q.id = OLD.quote_id
            AND q.project_id = OLD.project_id
            AND q.company_id = OLD.company_id
            AND q.status = 'pending'
            AND q.stripe_payment_intent_id IS NULL
            AND (
              (OLD.slot_id IS NULL AND q.slot_id IS NULL)
              OR q.slot_id = OLD.slot_id
            )
       )
    THEN
      RAISE EXCEPTION 'GC trade counteroffers can only be accepted while the linked quote is still pending and unfunded';
    END IF;

    IF NEW.responded_at IS NULL THEN
      RAISE EXCEPTION 'GC trade negotiation responses must include a response timestamp';
    END IF;

    IF NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC trade negotiation responses cannot include cancellation details';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = OLD.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'Only the requesting GC can cancel a GC trade negotiation';
    END IF;

    IF NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'GC trade negotiation cancellations must include a cancellation timestamp';
    END IF;

    IF NEW.company_response_note IS NOT NULL OR NEW.responded_at IS NOT NULL THEN
      RAISE EXCEPTION 'GC trade negotiation cancellations cannot include response details';
    END IF;
  ELSIF NEW.status = 'pending' THEN
    RAISE EXCEPTION 'GC trade negotiation status cannot be reset to pending';
  ELSE
    RAISE EXCEPTION 'Invalid GC trade negotiation status transition';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_gc_trade_negotiation_updates() FROM PUBLIC, anon, authenticated;
