-- Enable RLS on processed_stripe_events to prevent public (anon) access.
-- The table is an idempotency ledger written only by the stripe-webhook edge
-- function, which uses the service role key and therefore bypasses RLS. A
-- deny-all policy blocks the public/anon role while leaving the webhook intact.
-- (Re-applied from april-27-branch as a timestamped migration to avoid colliding
--  with the existing 010_companies_location_fields.sql migration.)

ALTER TABLE processed_stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access" ON processed_stripe_events
  FOR ALL USING (false);
