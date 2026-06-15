-- Track payout release for paid GC concierge bookings. Homeowners still
-- explicitly release the GC share after confirming the service is complete.

ALTER TABLE public.gc_concierge_bookings
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_released_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS gc_concierge_bookings_transfer_key
  ON public.gc_concierge_bookings(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;
