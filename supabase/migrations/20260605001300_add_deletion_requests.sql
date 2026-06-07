-- Account deletion starts as an auditable request so support/admin automation
-- can process it without the mobile client needing elevated privileges.

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  processed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS deletion_requests_pending_user_idx
  ON public.deletion_requests(user_id)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deletion_requests_insert_own" ON public.deletion_requests;
DROP POLICY IF EXISTS "deletion_requests_select_own" ON public.deletion_requests;

CREATE POLICY "deletion_requests_insert_own" ON public.deletion_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "deletion_requests_select_own" ON public.deletion_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
