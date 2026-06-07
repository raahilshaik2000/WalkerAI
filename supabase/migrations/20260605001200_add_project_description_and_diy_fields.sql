-- DIY guide projects need their own category/guide fields. Do not overload
-- projects.room_type, which is reserved for kitchen/bathroom renovation flows.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS diy_category TEXT CHECK (
    diy_category IS NULL OR diy_category IN (
      'plumbing',
      'electrical',
      'carpentry',
      'painting',
      'flooring',
      'hvac',
      'landscaping',
      'general'
    )
  ),
  ADD COLUMN IF NOT EXISTS diy_guide JSONB;
