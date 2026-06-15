-- Stripe Connect readiness gates job acceptance, material order claiming, and
-- payout release. Account owners can edit their profile rows through broad
-- RLS policies, so protect Stripe-owned fields at the database layer and keep
-- them service-role maintained.

CREATE OR REPLACE FUNCTION public.guard_stripe_readiness_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_account_id IS NOT NULL
      OR COALESCE(NEW.stripe_details_submitted, FALSE) IS TRUE
      OR COALESCE(NEW.stripe_payouts_enabled, FALSE) IS TRUE
      OR COALESCE(NEW.stripe_transfers_active, FALSE) IS TRUE
      OR NEW.stripe_onboarding_checked_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'Stripe payout readiness is maintained by WalkerAI backend services';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
    OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted
    OR NEW.stripe_payouts_enabled IS DISTINCT FROM OLD.stripe_payouts_enabled
    OR NEW.stripe_transfers_active IS DISTINCT FROM OLD.stripe_transfers_active
    OR NEW.stripe_onboarding_checked_at IS DISTINCT FROM OLD.stripe_onboarding_checked_at
  THEN
    RAISE EXCEPTION 'Stripe payout readiness is maintained by WalkerAI backend services';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_company_stripe_readiness_fields ON public.companies;
CREATE TRIGGER guard_company_stripe_readiness_fields
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_stripe_readiness_fields();

DROP TRIGGER IF EXISTS guard_supplier_stripe_readiness_fields ON public.suppliers;
CREATE TRIGGER guard_supplier_stripe_readiness_fields
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_stripe_readiness_fields();

DROP TRIGGER IF EXISTS guard_gc_stripe_readiness_fields ON public.general_contractors;
CREATE TRIGGER guard_gc_stripe_readiness_fields
  BEFORE INSERT OR UPDATE ON public.general_contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_stripe_readiness_fields();

REVOKE ALL ON FUNCTION public.guard_stripe_readiness_fields() FROM PUBLIC, anon, authenticated;
