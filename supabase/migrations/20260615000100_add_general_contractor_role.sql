-- Add General Contractor as a distinct fourth account type.
-- A company may still list "general_contractor" as a trade; this role is for
-- GC/Concierge project management accounts with homeowner approval authority.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('homeowner', 'company', 'supplier', 'general_contractor', 'admin'));

CREATE TABLE IF NOT EXISTS public.general_contractors (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_name              TEXT NOT NULL,
  address                    TEXT,
  city                       TEXT,
  province                   CHAR(2),
  postal_code                TEXT,
  location                   GEOGRAPHY(Point, 4326),
  lat                        DOUBLE PRECISION,
  lng                        DOUBLE PRECISION,
  service_radius_km          INTEGER NOT NULL DEFAULT 100 CHECK (service_radius_km BETWEEN 10 AND 500),
  license_number             TEXT,
  license_doc_url            TEXT,
  insurance_doc_url          TEXT,
  verified                   BOOLEAN NOT NULL DEFAULT FALSE,
  concierge_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  default_markup_pct         NUMERIC(5,2) NOT NULL DEFAULT 15 CHECK (default_markup_pct >= 0 AND default_markup_pct <= 50),
  default_concierge_fee_pct  NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (default_concierge_fee_pct >= 0 AND default_concierge_fee_pct <= 25),
  rating                     NUMERIC(3,2),
  total_reviews              INTEGER NOT NULL DEFAULT 0,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS general_contractors_user_id_key
  ON public.general_contractors(user_id);

CREATE INDEX IF NOT EXISTS general_contractors_location_idx
  ON public.general_contractors USING GIST (location);

CREATE TABLE IF NOT EXISTS public.general_contractor_projects (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                 UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  general_contractor_id      UUID NOT NULL REFERENCES public.general_contractors(id) ON DELETE CASCADE,
  homeowner_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status                     TEXT NOT NULL DEFAULT 'invited'
                               CHECK (status IN ('invited', 'active', 'completed', 'removed')),
  concierge_fee_pct          NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (concierge_fee_pct >= 0 AND concierge_fee_pct <= 25),
  markup_pct                 NUMERIC(5,2) NOT NULL DEFAULT 15 CHECK (markup_pct >= 0 AND markup_pct <= 50),
  scope_summary              TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, general_contractor_id)
);

CREATE INDEX IF NOT EXISTS general_contractor_projects_gc_idx
  ON public.general_contractor_projects(general_contractor_id, status);

CREATE INDEX IF NOT EXISTS general_contractor_projects_homeowner_idx
  ON public.general_contractor_projects(homeowner_id, status);

ALTER TABLE public.general_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_contractor_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "general_contractors_select_own" ON public.general_contractors;
CREATE POLICY "general_contractors_select_own" ON public.general_contractors
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "general_contractors_insert_own" ON public.general_contractors;
CREATE POLICY "general_contractors_insert_own" ON public.general_contractors
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "general_contractors_update_own" ON public.general_contractors;
CREATE POLICY "general_contractors_update_own" ON public.general_contractors
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "gc_projects_select_participants" ON public.general_contractor_projects;
CREATE POLICY "gc_projects_select_participants" ON public.general_contractor_projects
  FOR SELECT USING (
    homeowner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.general_contractors gc
      WHERE gc.id = general_contractor_projects.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "gc_projects_homeowner_insert" ON public.general_contractor_projects;
CREATE POLICY "gc_projects_homeowner_insert" ON public.general_contractor_projects
  FOR INSERT WITH CHECK (
    homeowner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = general_contractor_projects.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "gc_projects_participant_update" ON public.general_contractor_projects;
CREATE POLICY "gc_projects_participant_update" ON public.general_contractor_projects
  FOR UPDATE USING (
    homeowner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.general_contractors gc
      WHERE gc.id = general_contractor_projects.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    homeowner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.general_contractors gc
      WHERE gc.id = general_contractor_projects.general_contractor_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.set_general_contractor_project_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_general_contractor_project_updated_at
  ON public.general_contractor_projects;

CREATE TRIGGER set_general_contractor_project_updated_at
  BEFORE UPDATE ON public.general_contractor_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_general_contractor_project_updated_at();
