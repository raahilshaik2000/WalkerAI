-- ============================================================
-- 20260623000000_default_master_payment_model.sql
-- Master-quote only: flip the column default and backfill.
--
-- This supersedes the manual cutover at
-- supabase/manual/cutover_master_payment_model.sql (which only changed the
-- default for NEW rows). That manual file remains in place for reference but
-- should NOT be run again — this migration covers both the default change and
-- the pre-launch data backfill.
--
-- Pre-launch context: no real legacy data exists. All existing non-master
-- projects are safe to flip to 'master'.
-- ============================================================

-- 1. Change the column default so new projects are always 'master'.
ALTER TABLE projects ALTER COLUMN payment_model SET DEFAULT 'master';

-- 2. Backfill any existing rows that were left as 'legacy' (pre-launch only —
--    no real homeowner data; this is safe to run unconditionally).
UPDATE projects
  SET payment_model = 'master'
  WHERE payment_model IS DISTINCT FROM 'master';
