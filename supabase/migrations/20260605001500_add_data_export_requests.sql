-- Data export requests need an auditable backend queue. The mobile client
-- records the request; support/admin automation can fulfill it asynchronously.

CREATE TABLE IF NOT EXISTS public.data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  completed_at TIMESTAMPTZ,
  export_url TEXT,
  error_message TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS data_export_requests_pending_user_idx
  ON public.data_export_requests(user_id)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_export_requests_insert_own" ON public.data_export_requests;
DROP POLICY IF EXISTS "data_export_requests_select_own" ON public.data_export_requests;

CREATE POLICY "data_export_requests_insert_own" ON public.data_export_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "data_export_requests_select_own" ON public.data_export_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
