-- Store the deterministic estimate confidence score shown in the project brief
-- and project detail screens.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ai_confidence_score INTEGER;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_ai_confidence_score_check,
  ADD CONSTRAINT projects_ai_confidence_score_check
    CHECK (
      ai_confidence_score IS NULL
      OR (ai_confidence_score >= 0 AND ai_confidence_score <= 100)
    );
