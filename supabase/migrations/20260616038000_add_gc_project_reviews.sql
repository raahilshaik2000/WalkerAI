-- Homeowners can review the GC manager after project completion, and GC
-- discovery ratings are recalculated from those completed-project reviews.

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

  IF current_setting('walker.internal_gc_rating_update', true) = 'review_rating' THEN
    IF v_trust_profile_changed OR NEW.verified IS DISTINCT FROM OLD.verified THEN
      RAISE EXCEPTION 'GC verification and review metrics are maintained by WalkerAI backend services';
    END IF;

    RETURN NEW;
  END IF;

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

DROP POLICY IF EXISTS "reviews_homeowner_insert_project_contractor" ON public.reviews;
CREATE POLICY "reviews_homeowner_insert_project_contractor" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = reviews.project_id
        AND p.homeowner_id = (SELECT auth.uid())
        AND p.status = 'completed'
        AND (
          EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.user_id = reviews.reviewee_id
              AND (
                p.assigned_company_id = c.id
                OR EXISTS (
                  SELECT 1
                  FROM public.project_slots ps
                  WHERE ps.project_id = p.id
                    AND ps.assigned_company_id = c.id
                    AND ps.status IN ('filled', 'scheduled')
                )
                OR EXISTS (
                  SELECT 1
                  FROM public.quotes q
                  WHERE q.project_id = p.id
                    AND q.company_id = c.id
                    AND q.status = 'approved'
                )
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.general_contractor_projects gcp
            JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
            WHERE gcp.project_id = p.id
              AND gcp.status IN ('active', 'completed')
              AND gc.user_id = reviews.reviewee_id
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.update_company_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_gc_id UUID;
  v_avg_rating NUMERIC(3,2);
  v_count INTEGER;
BEGIN
  SELECT id
  INTO v_company_id
  FROM public.companies
  WHERE user_id = NEW.reviewee_id;

  IF v_company_id IS NOT NULL THEN
    SELECT AVG(rating)::NUMERIC(3,2), COUNT(*)
    INTO v_avg_rating, v_count
    FROM public.reviews
    WHERE reviewee_id = NEW.reviewee_id;

    UPDATE public.companies
    SET
      rating = v_avg_rating,
      total_reviews = v_count
    WHERE id = v_company_id;

    RETURN NEW;
  END IF;

  SELECT id
  INTO v_gc_id
  FROM public.general_contractors
  WHERE user_id = NEW.reviewee_id;

  IF v_gc_id IS NOT NULL THEN
    SELECT AVG(rating)::NUMERIC(3,2), COUNT(*)
    INTO v_avg_rating, v_count
    FROM public.reviews
    WHERE reviewee_id = NEW.reviewee_id;

    PERFORM set_config('walker.internal_gc_rating_update', 'review_rating', true);

    UPDATE public.general_contractors
    SET
      rating = v_avg_rating,
      total_reviews = v_count
    WHERE id = v_gc_id;

    PERFORM set_config('walker.internal_gc_rating_update', '', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_company_rating ON public.reviews;
CREATE TRIGGER trigger_update_company_rating
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_rating();
