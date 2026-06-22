-- ============================================================
-- 20260621000000_master_quote_payment_phase_a.sql
-- Master-quote payment model — Phase A (schema only).
--
-- Adds the columns the master-quote flow needs:
--   * projects        : master total, payment status, margin, model flag
--   * project_slots   : per-trade payout + lifecycle (locked at acceptance)
--
-- Decisions (see thoughts/shared/plans/master-quote-payment-2026-06-19.md):
--   D1  margin model (a), 10% hidden -> platform_margin_pct default 0.10
--   D2  one payout per trade        -> project_slots payout lifecycle
--   D4  fence existing projects     -> payment_model: existing = 'legacy',
--                                      new rows default 'master'
-- This migration is purely additive and back-compat: legacy projects keep
-- running on the old quotes/milestones path, untouched.
-- ============================================================

-- 1. projects: master-quote / margin fields ------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS master_total_cents       INTEGER,    -- homeowner-facing total (CAD cents); populated when computed
  ADD COLUMN IF NOT EXISTS master_payment_intent_id TEXT,       -- Stripe PI id for the single master payment (escrow)
  ADD COLUMN IF NOT EXISTS payment_status           TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS platform_margin_pct      NUMERIC NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS payment_model            TEXT NOT NULL DEFAULT 'legacy';

-- payment_status lifecycle for the master PI (escrow):
--   unpaid -> funded (master PI captured) -> refunded
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_payment_status_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_payment_status_check
  CHECK (payment_status IN ('unpaid', 'funded', 'refunded'));

-- payment_model: which payout path a project runs.
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_payment_model_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_payment_model_check
  CHECK (payment_model IN ('legacy', 'master'));

-- margin must be a sane fraction.
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_platform_margin_pct_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_platform_margin_pct_check
  CHECK (platform_margin_pct >= 0 AND platform_margin_pct < 1);

-- D4 + staged rollout: default is 'legacy' so this migration + the new edge
-- function code can ship *inert* — existing AND new projects stay on the old
-- per-quote path until the master UI (Phase E) is live. Cutover happens in a
-- later one-line migration that flips the default to 'master' (new projects
-- only); in-flight legacy projects are never migrated (they're disposable).

-- 2. project_slots: per-trade payout + lifecycle -------------
ALTER TABLE project_slots
  ADD COLUMN IF NOT EXISTS payout_cents            INTEGER,     -- locked at acceptance = avg(estimate) * (1 - margin)
  ADD COLUMN IF NOT EXISTS payout_status           TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_transfer_id      TEXT,        -- set when the trade payout transfer succeeds
  ADD COLUMN IF NOT EXISTS completion_submitted_at TIMESTAMPTZ, -- trade submitted completion photos
  ADD COLUMN IF NOT EXISTS approved_at             TIMESTAMPTZ, -- homeowner approved the job
  ADD COLUMN IF NOT EXISTS work_order              INTEGER;     -- 1-based execution sequence (demolition -> ... -> finish); trades run strictly in order

-- payout lifecycle: pending -> approved (homeowner OK'd) -> paid (transferred)
ALTER TABLE project_slots
  DROP CONSTRAINT IF EXISTS project_slots_payout_status_check;
ALTER TABLE project_slots
  ADD CONSTRAINT project_slots_payout_status_check
  CHECK (payout_status IN ('pending', 'approved', 'paid'));

-- payout must be non-negative when set.
ALTER TABLE project_slots
  DROP CONSTRAINT IF EXISTS project_slots_payout_cents_check;
ALTER TABLE project_slots
  ADD CONSTRAINT project_slots_payout_cents_check
  CHECK (payout_cents IS NULL OR payout_cents >= 0);

-- Index for the release flow / payout dashboards.
CREATE INDEX IF NOT EXISTS idx_project_slots_payout_status
  ON project_slots(payout_status);

-- 3. Documentation comments ----------------------------------
COMMENT ON COLUMN projects.master_total_cents  IS 'Master-quote homeowner-facing total (CAD cents). Single PI captured to platform balance.';
COMMENT ON COLUMN projects.master_payment_intent_id IS 'Stripe PaymentIntent id for the master payment. Set by create-payment-intent; matched by stripe-webhook on payment_intent.succeeded.';
COMMENT ON COLUMN projects.payment_status      IS 'Master PI escrow status: unpaid|funded|refunded. Used by master-model projects only.';
COMMENT ON COLUMN projects.platform_margin_pct IS 'WalkerAI implicit margin. trade_payout = slot_estimate * (1 - platform_margin_pct). Never shown to homeowner.';
COMMENT ON COLUMN projects.payment_model       IS 'legacy = old per-quote/milestone path; master = new master-quote path. Set per project; legacy projects fenced (D4).';
COMMENT ON COLUMN project_slots.payout_cents   IS 'Per-trade payout (CAD cents), locked at acceptance from AI slot estimate minus margin.';
COMMENT ON COLUMN project_slots.payout_status  IS 'pending -> approved (homeowner approved photos) -> paid (Stripe transfer done).';
COMMENT ON COLUMN project_slots.work_order     IS '1-based execution sequence. Trades run strictly in order: a slot can only be completed/approved/paid once every lower work_order slot is paid.';
