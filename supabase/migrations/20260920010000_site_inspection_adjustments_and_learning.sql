-- Migration: 20260920010000_site_inspection_adjustments_and_learning.sql
-- Description: Adds site inspection price adjustments workflow and continuous estimation learning dataset.

-- 1. Site Inspection Adjustments Table
CREATE TABLE IF NOT EXISTS public.site_inspection_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trade_type TEXT NOT NULL,
  reason_category TEXT NOT NULL CHECK (
    reason_category IN (
      'plumbing_roughin_mismatch',
      'subfloor_framing_damage',
      'measurement_variance',
      'electrical_service_upgrade',
      'structural_obstacle',
      'hazardous_material',
      'material_discontinuation',
      'other'
    )
  ),
  description TEXT NOT NULL,
  evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  corrected_measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  labor_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  material_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  schedule_impact_days INTEGER NOT NULL DEFAULT 0,
  cost_delta INTEGER NOT NULL, -- in CAD cents (+ for increase, - for decrease)
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (
    status IN (
      'submitted',
      'under_review',
      'approved_by_head_office',
      'rejected_by_head_office',
      'awaiting_homeowner_funding',
      'approved_and_funded',
      'credited',
      'cancelled'
    )
  ),
  head_office_reviewer_id UUID REFERENCES public.users(id),
  head_office_reviewed_at TIMESTAMPTZ,
  head_office_notes TEXT,
  homeowner_signed_at TIMESTAMPTZ,
  payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_inspection_adjustments_project
  ON public.site_inspection_adjustments(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_inspection_adjustments_company
  ON public.site_inspection_adjustments(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_inspection_adjustments_status
  ON public.site_inspection_adjustments(status);

ALTER TABLE public.site_inspection_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS: Company can read their own submissions
CREATE POLICY "site_inspection_adjustments_company_read"
  ON public.site_inspection_adjustments
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS: Company can insert for projects they are assigned to
CREATE POLICY "site_inspection_adjustments_company_insert"
  ON public.site_inspection_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies WHERE user_id = auth.uid()
    )
  );

-- RLS: Homeowner can read adjustments on their project
CREATE POLICY "site_inspection_adjustments_homeowner_read"
  ON public.site_inspection_adjustments
  FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE homeowner_id = auth.uid()
    )
  );

-- 2. Continuous Estimation Learning Records Table
CREATE TABLE IF NOT EXISTS public.estimation_learning_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  adjustment_id UUID REFERENCES public.site_inspection_adjustments(id) ON DELETE SET NULL,
  room_type TEXT NOT NULL,
  province TEXT NOT NULL,
  quality_tier TEXT NOT NULL,
  original_measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  dimensional_variance_ratio NUMERIC(6, 4) NOT NULL DEFAULT 1.0,
  original_estimated_cost_cents INTEGER NOT NULL,
  approved_cost_delta_cents INTEGER NOT NULL,
  final_cost_cents INTEGER NOT NULL,
  adjustment_category TEXT NOT NULL,
  adjustment_reason TEXT NOT NULL,
  evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  itemized_labor_diff JSONB NOT NULL DEFAULT '[]'::jsonb,
  itemized_material_diff JSONB NOT NULL DEFAULT '[]'::jsonb,
  head_office_approved_by UUID REFERENCES public.users(id),
  head_office_approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calibration_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estimation_learning_room_prov
  ON public.estimation_learning_records(room_type, province, quality_tier);

CREATE INDEX IF NOT EXISTS idx_estimation_learning_category
  ON public.estimation_learning_records(adjustment_category);

ALTER TABLE public.estimation_learning_records ENABLE ROW LEVEL SECURITY;

-- RLS: Learning records read access for authenticated estimators / admins
CREATE POLICY "estimation_learning_records_read"
  ON public.estimation_learning_records
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service role / admin can write learning records
CREATE POLICY "estimation_learning_records_admin_write"
  ON public.estimation_learning_records
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
