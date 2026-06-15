-- GC verification and review metrics drive homeowner discovery and assignment
-- eligibility. GC owners can update their profile rows during onboarding, so
-- keep these trust fields service-role maintained at the database layer.

CREATE OR REPLACE FUNCTION public.guard_gc_trust_fields()
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
    IF COALESCE(NEW.verified, FALSE) IS TRUE
      OR NEW.rating IS NOT NULL
      OR COALESCE(NEW.total_reviews, 0) <> 0
    THEN
      RAISE EXCEPTION 'GC verification and review metrics are maintained by WalkerAI backend services';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
    OR NEW.rating IS DISTINCT FROM OLD.rating
    OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
  THEN
    RAISE EXCEPTION 'GC verification and review metrics are maintained by WalkerAI backend services';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_trust_fields_trigger ON public.general_contractors;
CREATE TRIGGER guard_gc_trust_fields_trigger
  BEFORE INSERT OR UPDATE ON public.general_contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_trust_fields();

REVOKE ALL ON FUNCTION public.guard_gc_trust_fields() FROM PUBLIC, anon, authenticated;
