-- Generic homeowner approval engine for GC/Concierge recommendations.
-- GCs can recommend; homeowners approve or reject before project changes
-- become authoritative.

CREATE TABLE IF NOT EXISTS public.project_approval_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id             UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by_gc_id     UUID NOT NULL REFERENCES public.general_contractors(id) ON DELETE CASCADE,
  homeowner_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type           TEXT NOT NULL CHECK (request_type IN (
                           'scope_change',
                           'material_substitution',
                           'trade_substitution',
                           'schedule_change',
                           'payment_release',
                           'change_order',
                           'general_recommendation'
                         )),
  title                  TEXT NOT NULL,
  description            TEXT,
  cost_delta             INTEGER,
  timeline_delta_days    INTEGER,
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  response_note          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS project_approval_requests_project_idx
  ON public.project_approval_requests(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS project_approval_requests_gc_idx
  ON public.project_approval_requests(requested_by_gc_id, status, created_at DESC);

ALTER TABLE public.project_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_requests_select_participants" ON public.project_approval_requests;
CREATE POLICY "approval_requests_select_participants" ON public.project_approval_requests
  FOR SELECT USING (
    homeowner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = project_approval_requests.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "approval_requests_gc_insert" ON public.project_approval_requests;
CREATE POLICY "approval_requests_gc_insert" ON public.project_approval_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      JOIN public.general_contractor_projects gcp
        ON gcp.general_contractor_id = gc.id
       AND gcp.project_id = project_approval_requests.project_id
       AND gcp.status = 'active'
      JOIN public.projects p
        ON p.id = gcp.project_id
       AND p.homeowner_id = project_approval_requests.homeowner_id
      WHERE gc.id = project_approval_requests.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "approval_requests_homeowner_update" ON public.project_approval_requests;
CREATE POLICY "approval_requests_homeowner_update" ON public.project_approval_requests
  FOR UPDATE USING (homeowner_id = (SELECT auth.uid()))
  WITH CHECK (homeowner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "approval_requests_gc_cancel" ON public.project_approval_requests;
CREATE POLICY "approval_requests_gc_cancel" ON public.project_approval_requests
  FOR UPDATE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = project_approval_requests.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status = 'cancelled'
    AND EXISTS (
      SELECT 1
      FROM public.general_contractors gc
      WHERE gc.id = project_approval_requests.requested_by_gc_id
        AND gc.user_id = (SELECT auth.uid())
    )
  );
