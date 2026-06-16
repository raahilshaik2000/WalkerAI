-- If a verified GC changes trust-critical profile or document fields, move the
-- account back to pending review. Backend service-role processes still own
-- verification, ratings, and review totals.

CREATE OR REPLACE FUNCTION public.guard_gc_trust_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trust_profile_changed BOOLEAN;
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

  v_trust_profile_changed :=
    NEW.business_name IS DISTINCT FROM OLD.business_name
    OR NEW.address IS DISTINCT FROM OLD.address
    OR NEW.city IS DISTINCT FROM OLD.city
    OR NEW.province IS DISTINCT FROM OLD.province
    OR NEW.postal_code IS DISTINCT FROM OLD.postal_code
    OR NEW.lat IS DISTINCT FROM OLD.lat
    OR NEW.lng IS DISTINCT FROM OLD.lng
    OR NEW.license_number IS DISTINCT FROM OLD.license_number
    OR NEW.license_doc_url IS DISTINCT FROM OLD.license_doc_url
    OR NEW.insurance_doc_url IS DISTINCT FROM OLD.insurance_doc_url;

  IF NEW.rating IS DISTINCT FROM OLD.rating
    OR NEW.total_reviews IS DISTINCT FROM OLD.total_reviews
  THEN
    RAISE EXCEPTION 'GC verification and review metrics are maintained by WalkerAI backend services';
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
     AND NOT (
       OLD.verified IS TRUE
       AND NEW.verified IS FALSE
       AND v_trust_profile_changed
     )
  THEN
    RAISE EXCEPTION 'GC verification and review metrics are maintained by WalkerAI backend services';
  END IF;

  IF OLD.verified IS TRUE AND v_trust_profile_changed THEN
    NEW.verified := FALSE;
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
