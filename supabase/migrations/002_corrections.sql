-- ============================================================
-- WalkerAI — Schema Corrections (from architecture review)
-- Apply after 001_initial_schema.sql
-- ============================================================

-- Drop and recreate users with additional fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS pipeda_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Drop single push_token column — replace with device_tokens table
ALTER TABLE users DROP COLUMN IF EXISTS push_token;

-- Device tokens table (one user can have multiple devices)
CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens (user_id) WHERE is_active = TRUE;

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_device_tokens" ON device_tokens
  FOR ALL USING (user_id = auth.uid());

-- Add separate lat/lng columns to companies (in addition to PostGIS geography)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT CHECK (province IN (
    'AB','BC','MB','NB','NL','NS','NT','NU','ON','PE','QC','SK','YT'
  )),
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS completed_jobs INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS specializations TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add separate lat/lng to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS assigned_company_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_round INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_radius_km INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS dispatch_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add processed_stripe_events table for idempotency
CREATE TABLE IF NOT EXISTS processed_stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  processed_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  messages            BOOLEAN DEFAULT TRUE,
  milestone_updates   BOOLEAN DEFAULT TRUE,
  payment_updates     BOOLEAN DEFAULT TRUE,  -- cannot be opted out (transactional)
  job_dispatch        BOOLEAN DEFAULT TRUE,  -- companies only
  marketing           BOOLEAN DEFAULT FALSE,
  warranty_reminders  BOOLEAN DEFAULT TRUE,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_notification_prefs" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- TRIGGER: Auto-sync lat/lng → PostGIS geography on companies
-- ============================================================
CREATE OR REPLACE FUNCTION sync_company_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_location ON companies;
CREATE TRIGGER trg_companies_location
  BEFORE INSERT OR UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION sync_company_location();

-- ============================================================
-- TRIGGER: Auto-sync lat/lng → PostGIS geography on projects
-- ============================================================
CREATE OR REPLACE FUNCTION sync_project_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_location ON projects;
CREATE TRIGGER trg_projects_location
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION sync_project_location();

-- ============================================================
-- REPLACE: accept-job function using FOR UPDATE NOWAIT
-- (replaces advisory lock approach — cleaner, same-transaction guarantee)
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_accept_job(
  p_project_id UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_project RECORD;
BEGIN
  -- Attempt to lock the project row exclusively.
  -- NOWAIT means: if another transaction already holds the lock (another accept in flight),
  -- raise an exception immediately instead of waiting → caller receives 409 Conflict.
  BEGIN
    SELECT id, status, assigned_company_id
    INTO v_project
    FROM projects
    WHERE id = p_project_id AND status = 'dispatching'
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    -- Another transaction is mid-accept — tell caller to retry once
    RETURN FALSE;
  END;

  -- No rows = project is no longer in dispatching state (already accepted or cancelled)
  IF v_project.id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verify this company was dispatched and hasn't responded yet
  IF NOT EXISTS (
    SELECT 1 FROM dispatch_logs
    WHERE project_id = p_project_id
      AND company_id = p_company_id
      AND response = 'pending'
  ) THEN
    RETURN FALSE;
  END IF;

  -- Assign the job
  UPDATE projects
  SET
    status = 'accepted',
    assigned_company_id = p_company_id,
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_project_id;

  -- Mark this company's dispatch as accepted
  UPDATE dispatch_logs
  SET response = 'accepted', responded_at = NOW()
  WHERE project_id = p_project_id AND company_id = p_company_id;

  -- Mark all other pending dispatches as filled
  UPDATE dispatch_logs
  SET response = 'filled', responded_at = NOW()
  WHERE project_id = p_project_id
    AND company_id != p_company_id
    AND response = 'pending';

  RETURN TRUE;
END;
$$;

-- ============================================================
-- Canadian HST/GST rates lookup function
-- Used when calculating commission invoices
-- ============================================================
CREATE OR REPLACE FUNCTION canadian_tax_rate(province_code TEXT)
RETURNS NUMERIC(5,4)
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE province_code
    WHEN 'ON' THEN 0.1300  -- 13% HST
    WHEN 'NB' THEN 0.1500  -- 15% HST
    WHEN 'NL' THEN 0.1500  -- 15% HST
    WHEN 'NS' THEN 0.1500  -- 15% HST
    WHEN 'PE' THEN 0.1500  -- 15% HST
    WHEN 'BC' THEN 0.0500  -- 5% GST only
    WHEN 'AB' THEN 0.0500  -- 5% GST only
    WHEN 'MB' THEN 0.0500  -- 5% GST only
    WHEN 'SK' THEN 0.0500  -- 5% GST only
    WHEN 'QC' THEN 0.0500  -- 5% GST only (QST handled separately)
    WHEN 'YT' THEN 0.0500
    WHEN 'NT' THEN 0.0500
    WHEN 'NU' THEN 0.0500
    ELSE 0.0500
  END;
$$;

-- ============================================================
-- Auto-create notification_preferences row on user insert
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_notification_prefs()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_default_notification_prefs
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_default_notification_prefs();
