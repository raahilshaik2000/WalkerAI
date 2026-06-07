-- Persist homeowner material preferences entered during project creation.
-- These preferences are passed to contractors in the saved materials and to
-- suppliers through material_order notes.

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS sort_order INTEGER,
  ADD COLUMN IF NOT EXISTS brand_preference TEXT,
  ADD COLUMN IF NOT EXISTS color_finish TEXT,
  ADD COLUMN IF NOT EXISTS specific_model TEXT,
  ADD COLUMN IF NOT EXISTS contractor_notes TEXT;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY item, id) - 1 AS row_index
  FROM public.materials
  WHERE sort_order IS NULL
)
UPDATE public.materials m
SET sort_order = ordered.row_index
FROM ordered
WHERE ordered.id = m.id;

CREATE INDEX IF NOT EXISTS idx_materials_project_sort_order
  ON public.materials(project_id, sort_order);
