-- Track push delivery attempts for notification rows. The send-push edge
-- function already updates these fields; older schemas were missing them.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_error TEXT;

CREATE INDEX IF NOT EXISTS notifications_unsent_push_idx
  ON public.notifications (created_at DESC)
  WHERE push_sent = FALSE;
