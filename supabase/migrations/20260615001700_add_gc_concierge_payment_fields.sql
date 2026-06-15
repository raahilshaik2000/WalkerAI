-- Stripe collection for accepted GC concierge service bookings.
-- This records platform-side collection only; GC payout/release remains a
-- separate completion/accounting workflow.

ALTER TABLE public.gc_concierge_bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'payment_pending', 'paid', 'refunded')),
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS gc_concierge_bookings_payment_intent_key
  ON public.gc_concierge_bookings(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
