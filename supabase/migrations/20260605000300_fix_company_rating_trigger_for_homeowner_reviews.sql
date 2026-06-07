-- Contractor-to-homeowner reviews share public.reviews, but company rating
-- aggregates must only react when the reviewed user belongs to a company.
-- The original trigger picked the first approved quote on the project and
-- incremented total_reviews even when reviewee_id was the homeowner.

CREATE OR REPLACE FUNCTION public.update_company_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id UUID;
  v_avg_rating NUMERIC(3,2);
  v_count INTEGER;
BEGIN
  SELECT id
  INTO v_company_id
  FROM public.companies
  WHERE user_id = NEW.reviewee_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

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
END;
$$;
