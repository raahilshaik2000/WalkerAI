-- Approving a GC payment request records homeowner authorization, so stale
-- pending requests should not be approvable after the GC is removed or loses
-- WalkerAI verification. Rejection remains available so homeowners can clear
-- invalid requests without authorizing them.

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
          WHERE gcp.project_id = OLD.project_id
            AND gcp.general_contractor_id = OLD.general_contractor_id
            AND gcp.homeowner_id = OLD.homeowner_id
            AND gcp.status = 'active'
            AND gc.verified IS TRUE
       )
    THEN
      RAISE EXCEPTION 'Active verified GC management is required before approving a GC payment request';
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
