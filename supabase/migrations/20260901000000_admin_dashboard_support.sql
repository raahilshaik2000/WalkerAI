-- Admin dashboard: account controls, project flags, dispute resolution, audit log.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('active', 'suspended', 'deactivated'));

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS admin_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS admin_reason TEXT;

CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES public.users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}',
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_activity_log_created_idx
  ON public.admin_activity_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_activity_log_admin_idx
  ON public.admin_activity_log (admin_id, created_at DESC);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_activity_log IS 'Walker AI admin audit trail. Service-role admin dashboard only.';
COMMENT ON COLUMN public.users.account_status IS 'active | suspended | deactivated';
COMMENT ON COLUMN public.projects.admin_paused IS 'Admin pause flag — blocks progression without cancelling the project.';
COMMENT ON COLUMN public.projects.admin_archived IS 'Admin archive flag — hides from active lists while retaining history.';
