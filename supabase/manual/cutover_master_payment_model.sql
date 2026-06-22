-- ============================================================
-- CUTOVER — activate the master-quote payment model for NEW projects.
--
-- ⚠️  Run this MANUALLY (Supabase SQL editor or psql), NOT via `supabase db
--     push`. It lives outside supabase/migrations on purpose so the rest of
--     the master-quote backend can ship INERT first.
--
-- Apply ONLY AFTER all of the following are live:
--   1. Migration 20260621000000_master_quote_payment_phase_a.sql is applied.
--   2. Edge functions deployed: accept-job, create-payment-intent,
--      stripe-webhook, release-trade-payout.
--   3. The app build containing the master-quote UI (Phase E) is released to
--      users (TestFlight/App Store). Consider a force-update: users on an
--      OLD build who create a project AFTER cutover will get a master project
--      their app cannot pay/approve.
--
-- Effect: new projects default to payment_model='master'. Existing projects
-- are NOT touched (they stay 'legacy' and finish on the old per-quote path).
-- ============================================================

ALTER TABLE projects ALTER COLUMN payment_model SET DEFAULT 'master';

-- To ROLL BACK the cutover (new projects go back to legacy):
--   ALTER TABLE projects ALTER COLUMN payment_model SET DEFAULT 'legacy';
