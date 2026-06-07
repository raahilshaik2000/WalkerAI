-- Keep slot-based dispatch audit fields aligned with the legacy
-- single-contractor accept path.

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
  PERFORM pg_advisory_xact_lock(hashtext(p_slot_id::text));

  SELECT project_id, status
  INTO v_project_id, v_slot_status
  FROM project_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF v_slot_status NOT IN ('open', 'dispatching') THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM dispatch_logs
    WHERE slot_id = p_slot_id
      AND company_id = p_company_id
      AND response = 'pending'
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE project_slots
  SET status              = 'filled',
      assigned_company_id = p_company_id,
      accepted_at         = NOW()
  WHERE id = p_slot_id;

  UPDATE dispatch_logs
  SET response = 'accepted',
      responded_at = NOW()
  WHERE slot_id = p_slot_id
    AND company_id = p_company_id
    AND response = 'pending';

  UPDATE dispatch_logs
  SET response = 'filled',
      responded_at = NOW()
  WHERE slot_id = p_slot_id
    AND company_id != p_company_id
    AND response = 'pending';

  SELECT COUNT(*) INTO v_open_count
  FROM project_slots
  WHERE project_id = v_project_id
    AND status NOT IN ('filled', 'scheduled');

  IF v_open_count = 0 THEN
    UPDATE projects
    SET status            = 'scheduling',
        scheduling_status = 'pending_homeowner'
    WHERE id = v_project_id;
  END IF;

  RETURN TRUE;
END;
$$;
