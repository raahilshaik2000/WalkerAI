-- Allow homeowners to review each company/trade on a multi-slot project.
ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_project_id_reviewer_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_project_reviewer_reviewee_unique
  ON public.reviews (project_id, reviewer_id, reviewee_id);
