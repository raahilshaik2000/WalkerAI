-- ============================================================
-- WalkerAI — Migration 003: Reviews, ratings, misc fixes
-- ============================================================

-- Add responded_at to dispatch_logs (referenced by atomic_accept_job)
ALTER TABLE dispatch_logs
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- ============================================================
-- RPC: Recompute aggregate rating for a company from reviews table
-- Called after homeowner submits a review
-- ============================================================
CREATE OR REPLACE FUNCTION update_company_rating(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_user_id UUID;
  v_avg_rating NUMERIC(3,2);
  v_count INTEGER;
BEGIN
  -- Get the user_id for this company
  SELECT user_id INTO v_user_id FROM companies WHERE id = p_company_id;

  -- Compute average from all reviews for this company's user
  SELECT AVG(rating)::NUMERIC(3,2), COUNT(*)
  INTO v_avg_rating, v_count
  FROM reviews
  WHERE reviewee_id = v_user_id;

  -- Update company record
  UPDATE companies
  SET
    rating = v_avg_rating,
    total_reviews = v_count,
    updated_at = NOW()
  WHERE id = p_company_id;
END;
$$;

-- ============================================================
-- RLC policies for reviews
-- ============================================================
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Reviewers can insert their own reviews
CREATE POLICY "reviewers_insert" ON reviews
  FOR INSERT WITH CHECK (reviewer_id = auth.uid());

-- Anyone can read reviews
CREATE POLICY "reviews_public_read" ON reviews
  FOR SELECT USING (TRUE);

-- ============================================================
-- RLS policies for change_orders
-- ============================================================
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "change_orders_participants" ON change_orders;

CREATE POLICY "change_orders_participants" ON change_orders
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE homeowner_id = auth.uid()
      UNION
      SELECT project_id FROM quotes
        WHERE company_id = (SELECT id FROM companies WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- RLS policies for warranties
-- ============================================================
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warranties_homeowner" ON warranties
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
  );

-- ============================================================
-- RLS for milestones
-- ============================================================
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_participants" ON milestones
  FOR ALL USING (
    quote_id IN (
      SELECT q.id FROM quotes q
      WHERE
        q.project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
        OR q.company_id = (SELECT id FROM companies WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- RLS for quotes
-- ============================================================
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_participants" ON quotes
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
    OR company_id = (SELECT id FROM companies WHERE user_id = auth.uid())
  );

-- ============================================================
-- RLS for disputes
-- ============================================================
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disputes_participants" ON disputes;

CREATE POLICY "disputes_participants" ON disputes
  FOR ALL USING (
    raised_by = auth.uid()
    OR project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
    OR project_id IN (
      SELECT project_id FROM quotes
        WHERE company_id = (SELECT id FROM companies WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- RLS for notifications (users see only their own)
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());
