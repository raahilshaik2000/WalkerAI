-- ============================================================
-- 009_trade_slots.sql — Trade-based slots, scheduling,
--                        material verification, quote line items
-- ============================================================

-- 1. Trade type enum
CREATE TYPE trade_type AS ENUM (
  'general_contractor',
  'plumber',
  'electrician',
  'tile_installer',
  'cabinet_installer',
  'painter',
  'flooring_installer',
  'drywall',
  'demolition'
);

-- 2. Project slots (one per trade required for the project)
CREATE TABLE project_slots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trade_type           trade_type NOT NULL,
  description          TEXT,
  estimated_cost_min   INTEGER,           -- CAD cents
  estimated_cost_max   INTEGER,           -- CAD cents
  status               TEXT NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'dispatching', 'filled', 'scheduled')),
  assigned_company_id  UUID REFERENCES companies(id),
  accepted_at          TIMESTAMPTZ,
  scheduled_start_date DATE,
  scheduled_end_date   DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Add trade fields to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS trade_types trade_type[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS primary_trade trade_type;

-- 4. Add slot_id to dispatch_logs
ALTER TABLE dispatch_logs
  ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES project_slots(id);

-- 5. Extend project status to include 'scheduling' and add scheduling fields
ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft', 'brief_ready', 'dispatching', 'scheduling', 'accepted', 'quoting',
    'active', 'completed', 'cancelled', 'disputed'
  ));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS scheduling_status TEXT
    CHECK (scheduling_status IN ('pending_homeowner', 'confirmed')),
  ADD COLUMN IF NOT EXISTS scheduled_start_date DATE;

-- 6. Material quantity verification (Phase 3)
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS verified_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS verified_by       UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verified_at       TIMESTAMPTZ;

-- 7. Quote line items (Phase 5)
CREATE TABLE quote_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('labour', 'material', 'other')),
  description TEXT NOT NULL,
  quantity    NUMERIC NOT NULL DEFAULT 1,
  unit        TEXT,
  unit_cost   INTEGER,    -- CAD cents
  total_cost  INTEGER,    -- CAD cents
  sort_order  INTEGER
);

-- ============================================================
-- 8. Atomic slot acceptance function
--    Returns TRUE if slot successfully claimed, FALSE otherwise
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_accept_slot(
  p_slot_id    UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_project_id  UUID;
  v_slot_status TEXT;
  v_open_count  INTEGER;
BEGIN
  -- Advisory lock scoped to this slot to prevent concurrent accepts
  PERFORM pg_advisory_xact_lock(hashtext(p_slot_id::text));

  SELECT project_id, status
  INTO v_project_id, v_slot_status
  FROM project_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  -- Only accept slots that are open or dispatching
  IF v_slot_status NOT IN ('open', 'dispatching') THEN
    RETURN FALSE;
  END IF;

  -- Verify this company was dispatched this slot
  IF NOT EXISTS (
    SELECT 1 FROM dispatch_logs
    WHERE slot_id = p_slot_id
      AND company_id = p_company_id
      AND response = 'pending'
  ) THEN
    RETURN FALSE;
  END IF;

  -- Mark the slot as filled
  UPDATE project_slots
  SET status              = 'filled',
      assigned_company_id = p_company_id,
      accepted_at         = NOW()
  WHERE id = p_slot_id;

  -- Mark this dispatch as accepted
  UPDATE dispatch_logs
  SET response = 'accepted',
      responded_at = NOW()
  WHERE slot_id = p_slot_id
    AND company_id = p_company_id
    AND response = 'pending';

  -- Mark all other pending dispatches for this slot as filled (slot taken)
  UPDATE dispatch_logs
  SET response = 'filled',
      responded_at = NOW()
  WHERE slot_id = p_slot_id
    AND company_id != p_company_id
    AND response = 'pending';

  -- Check if ALL slots for this project are now filled
  SELECT COUNT(*) INTO v_open_count
  FROM project_slots
  WHERE project_id = v_project_id
    AND status NOT IN ('filled', 'scheduled');

  -- If all filled, move project to scheduling phase
  IF v_open_count = 0 THEN
    UPDATE projects
    SET status            = 'scheduling',
        scheduling_status = 'pending_homeowner'
    WHERE id = v_project_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 9. Atomic material order claim function (Phase 4)
-- ============================================================
CREATE OR REPLACE FUNCTION atomic_claim_material_order(
  p_order_id   UUID,
  p_supplier_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT status INTO v_status
  FROM material_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_status != 'open' THEN
    RETURN FALSE;
  END IF;

  UPDATE material_orders
  SET status               = 'accepted',
      accepted_supplier_id = p_supplier_id,
      updated_at           = NOW()
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE project_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

-- Homeowners read their project's slots
CREATE POLICY "slots_homeowner_read" ON project_slots
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
  );

-- Homeowners schedule already-filled slots from the app. Creation, deletion,
-- assignment, trade selection, and pricing stay server-side.
CREATE POLICY "slots_homeowner_schedule" ON project_slots
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
  )
  WITH CHECK (
    project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
  );

-- Companies see slots dispatched to them
CREATE POLICY "slots_company_dispatched" ON project_slots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dispatch_logs dl
      JOIN companies c ON c.id = dl.company_id
      WHERE dl.slot_id = project_slots.id
        AND c.user_id = auth.uid()
    )
  );

-- Companies see their own accepted slots
CREATE POLICY "slots_company_assigned" ON project_slots
  FOR SELECT USING (
    assigned_company_id IN (
      SELECT id FROM companies WHERE user_id = auth.uid()
    )
  );

-- Quote line items: homeowner reads, company manages
CREATE POLICY "line_items_homeowner_read" ON quote_line_items
  FOR SELECT USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN projects p ON p.id = q.project_id
      WHERE p.homeowner_id = auth.uid()
    )
  );

CREATE POLICY "line_items_company" ON quote_line_items
  FOR ALL USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      JOIN companies c ON c.id = q.company_id
      WHERE c.user_id = auth.uid()
    )
  );

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_project_slots_project    ON project_slots(project_id);
CREATE INDEX IF NOT EXISTS idx_project_slots_status     ON project_slots(status);
CREATE INDEX IF NOT EXISTS idx_project_slots_company    ON project_slots(assigned_company_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_logs_slot       ON dispatch_logs(slot_id);
CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote   ON quote_line_items(quote_id);
