-- ============================================================
-- WalkerAI — Initial Database Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;  -- for dispatch timeout scheduling

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('homeowner', 'company', 'admin')),
  push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  location GEOGRAPHY(POINT, 4326),  -- PostGIS spatial point
  service_radius_km INTEGER DEFAULT 50,
  license_number TEXT,
  insurance_doc_url TEXT,
  wc_doc_url TEXT,
  stripe_account_id TEXT,
  verified BOOLEAN DEFAULT FALSE,
  rating NUMERIC(3,2),
  total_reviews INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX companies_location_idx ON companies USING GIST (location);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homeowner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  room_type TEXT CHECK (room_type IN ('kitchen', 'bathroom')),
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'dispatching', 'accepted', 'quoting',
    'active', 'completed', 'cancelled', 'disputed'
  )),
  ai_analysis JSONB,
  questionnaire_answers JSONB,
  selected_render_id UUID,
  ai_cost_min INTEGER,              -- CAD cents
  ai_cost_max INTEGER,              -- CAD cents
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX projects_homeowner_idx ON projects (homeowner_id);
CREATE INDEX projects_location_idx ON projects USING GIST (location);

-- ============================================================
-- PROJECT PHOTOS
-- ============================================================
CREATE TABLE project_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AI RENDERS
-- ============================================================
CREATE TABLE renders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  style_params JSONB,
  selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MATERIALS
-- ============================================================
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  quality_tier TEXT CHECK (quality_tier IN ('budget', 'mid-range', 'luxury'))
);

-- ============================================================
-- SCOPE OF WORK
-- ============================================================
CREATE TABLE scope_of_work (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER
);

-- ============================================================
-- PERMITS
-- ============================================================
CREATE TABLE permits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  permit_type TEXT NOT NULL,
  status TEXT DEFAULT 'not_applied' CHECK (status IN (
    'not_applied', 'applied', 'approved',
    'inspection_scheduled', 'passed'
  )),
  document_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- QUOTES
-- ============================================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  total_amount INTEGER NOT NULL,    -- CAD cents
  stripe_payment_intent_id TEXT,
  stripe_transfer_group TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- ============================================================
-- MILESTONES
-- ============================================================
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,          -- CAD cents
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'started', 'in_progress', 'completed',
    'homeowner_approved', 'paid'
  )),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  stripe_transfer_id TEXT,
  sort_order INTEGER
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id),
  body TEXT,
  attachment_url TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX messages_project_idx ON messages (project_id, sent_at);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  reviewer_id UUID REFERENCES users(id),
  reviewee_id UUID REFERENCES users(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
  communication_rating INTEGER CHECK (communication_rating BETWEEN 1 AND 5),
  timeliness_rating INTEGER CHECK (timeliness_rating BETWEEN 1 AND 5),
  cleanliness_rating INTEGER CHECK (cleanliness_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, reviewer_id)  -- one review per reviewer per project
);

-- ============================================================
-- WARRANTIES
-- ============================================================
CREATE TABLE warranties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  document_url TEXT NOT NULL,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHANGE ORDERS
-- ============================================================
CREATE TABLE change_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  cost_delta INTEGER,               -- CAD cents, can be negative
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  signed_by_homeowner BOOLEAN DEFAULT FALSE,
  signed_by_company BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DISPUTES
-- ============================================================
CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  raised_by UUID REFERENCES users(id),
  milestone_id UUID REFERENCES milestones(id),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX notifications_user_idx ON notifications (user_id, read, created_at DESC);

-- ============================================================
-- DISPATCH LOGS
-- ============================================================
CREATE TABLE dispatch_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  round INTEGER DEFAULT 1,
  dispatched_at TIMESTAMPTZ DEFAULT NOW(),
  response TEXT DEFAULT 'pending' CHECK (response IN (
    'pending', 'accepted', 'filled', 'timeout', 'declined'
  ))
);

CREATE INDEX dispatch_logs_project_idx ON dispatch_logs (project_id);
CREATE INDEX dispatch_logs_company_idx ON dispatch_logs (company_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Find verified companies within a radius, ordered by proximity
CREATE OR REPLACE FUNCTION companies_within_radius(
  project_lat FLOAT,
  project_lng FLOAT,
  radius_km FLOAT DEFAULT 50
)
RETURNS TABLE (company_id UUID, distance_km FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id AS company_id,
    ST_Distance(
      c.location,
      ST_MakePoint(project_lng, project_lat)::GEOGRAPHY
    ) / 1000 AS distance_km
  FROM companies c
  WHERE
    c.verified = TRUE
    AND c.location IS NOT NULL
    AND ST_DWithin(
      c.location,
      ST_MakePoint(project_lng, project_lat)::GEOGRAPHY,
      radius_km * 1000
    )
  ORDER BY distance_km
  LIMIT 10;
$$;

-- Atomic job acceptance (prevents race conditions)
-- Returns TRUE if this company successfully claimed the job
CREATE OR REPLACE FUNCTION atomic_accept_job(
  p_project_id UUID,
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_current_status TEXT;
  v_dispatch_exists BOOLEAN;
BEGIN
  -- Acquire advisory lock scoped to this project (prevents concurrent accepts)
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id::text));

  -- Check project is still in dispatching state
  SELECT status INTO v_current_status
  FROM projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF v_current_status != 'dispatching' THEN
    RETURN FALSE;
  END IF;

  -- Verify this company was actually dispatched this project
  SELECT EXISTS (
    SELECT 1 FROM dispatch_logs
    WHERE project_id = p_project_id
      AND company_id = p_company_id
      AND response = 'pending'
  ) INTO v_dispatch_exists;

  IF NOT v_dispatch_exists THEN
    RETURN FALSE;
  END IF;

  -- Accept: update project status
  UPDATE projects SET status = 'accepted' WHERE id = p_project_id;

  -- Mark this company's dispatch as accepted
  UPDATE dispatch_logs
  SET response = 'accepted'
  WHERE project_id = p_project_id AND company_id = p_company_id;

  -- Mark all other pending dispatches for this project as filled
  UPDATE dispatch_logs
  SET response = 'filled'
  WHERE project_id = p_project_id
    AND company_id != p_company_id
    AND response = 'pending';

  RETURN TRUE;
END;
$$;

-- Update company rating after review
CREATE OR REPLACE FUNCTION update_company_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Find the company associated with this project's accepted quote
  SELECT q.company_id INTO v_company_id
  FROM quotes q
  WHERE q.project_id = NEW.project_id AND q.status = 'approved'
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    UPDATE companies
    SET
      rating = (
        SELECT ROUND(AVG(rating)::NUMERIC, 2)
        FROM reviews r
        JOIN projects p ON p.id = r.project_id
        JOIN quotes q ON q.project_id = p.id AND q.status = 'approved'
        WHERE q.company_id = v_company_id
          AND r.reviewee_id = (SELECT user_id FROM companies WHERE id = v_company_id)
      ),
      total_reviews = total_reviews + 1
    WHERE id = v_company_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_company_rating
AFTER INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION update_company_rating();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE renders ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_of_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Users: read own record
CREATE POLICY "users_read_own" ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

-- Companies: read own record; public can read verified companies' public fields
CREATE POLICY "companies_read_own" ON companies
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "companies_public_read" ON companies
  FOR SELECT USING (verified = TRUE);

-- Projects: homeowners manage their own
CREATE POLICY "projects_homeowner_all" ON projects
  FOR ALL USING (homeowner_id = auth.uid());

-- Projects: companies can read projects dispatched to them
CREATE POLICY "projects_company_dispatched" ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dispatch_logs dl
      JOIN companies c ON c.id = dl.company_id
      WHERE dl.project_id = projects.id
        AND c.user_id = auth.uid()
    )
  );

-- Project photos: homeowners own them; companies can see dispatched project photos
CREATE POLICY "project_photos_homeowner" ON project_photos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

CREATE POLICY "project_photos_company_dispatched" ON project_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dispatch_logs dl
      JOIN companies c ON c.id = dl.company_id
      WHERE dl.project_id = project_photos.project_id AND c.user_id = auth.uid()
    )
  );

-- Renders: same access as project photos
CREATE POLICY "renders_homeowner" ON renders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

CREATE POLICY "renders_company_dispatched" ON renders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dispatch_logs dl
      JOIN companies c ON c.id = dl.company_id
      WHERE dl.project_id = renders.project_id AND c.user_id = auth.uid()
    )
  );

-- Materials, scope_of_work, permits: homeowner + companies with dispatch
CREATE POLICY "materials_homeowner" ON materials
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

CREATE POLICY "materials_company" ON materials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dispatch_logs dl
      JOIN companies c ON c.id = dl.company_id
      WHERE dl.project_id = materials.project_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "scope_homeowner" ON scope_of_work
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

CREATE POLICY "scope_company" ON scope_of_work
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dispatch_logs dl
      JOIN companies c ON c.id = dl.company_id
      WHERE dl.project_id = scope_of_work.project_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "permits_homeowner" ON permits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

CREATE POLICY "permits_company" ON permits
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN companies c ON c.id = q.company_id
      WHERE q.project_id = permits.project_id AND c.user_id = auth.uid()
    )
  );

-- Quotes: homeowner reads; company manages own quote
CREATE POLICY "quotes_homeowner" ON quotes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

CREATE POLICY "quotes_homeowner_approve" ON quotes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

CREATE POLICY "quotes_company" ON quotes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM companies WHERE id = company_id AND user_id = auth.uid())
  );

-- Milestones: project participants
CREATE POLICY "milestones_project_participants" ON milestones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = milestones.quote_id
        AND (
          EXISTS (SELECT 1 FROM projects WHERE id = q.project_id AND homeowner_id = auth.uid())
          OR
          EXISTS (SELECT 1 FROM companies WHERE id = q.company_id AND user_id = auth.uid())
        )
    )
  );

-- Messages: project participants only
CREATE POLICY "messages_project_participants" ON messages
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE homeowner_id = auth.uid()
      UNION
      SELECT q.project_id FROM quotes q
      JOIN companies c ON c.id = q.company_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Reviews: reviewer manages own; reviewee can read
CREATE POLICY "reviews_reviewer" ON reviews
  FOR ALL USING (reviewer_id = auth.uid());

CREATE POLICY "reviews_reviewee_read" ON reviews
  FOR SELECT USING (reviewee_id = auth.uid());

-- Warranties: project homeowner; assigned company
CREATE POLICY "warranties_participants" ON warranties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM quotes q
      JOIN companies c ON c.id = q.company_id
      WHERE q.project_id = warranties.project_id AND c.user_id = auth.uid()
    )
  );

-- Change orders: project participants
CREATE POLICY "change_orders_participants" ON change_orders
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE homeowner_id = auth.uid()
      UNION
      SELECT q.project_id FROM quotes q
      JOIN companies c ON c.id = q.company_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Disputes: project participants
CREATE POLICY "disputes_participants" ON disputes
  FOR ALL USING (
    project_id IN (
      SELECT id FROM projects WHERE homeowner_id = auth.uid()
      UNION
      SELECT q.project_id FROM quotes q
      JOIN companies c ON c.id = q.company_id
      WHERE c.user_id = auth.uid()
    )
  );

-- Notifications: own only
CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Dispatch logs: companies see their own dispatches
CREATE POLICY "dispatch_logs_company" ON dispatch_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM companies WHERE id = company_id AND user_id = auth.uid())
  );

-- Homeowners can see dispatch status for their projects
CREATE POLICY "dispatch_logs_homeowner" ON dispatch_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects WHERE id = project_id AND homeowner_id = auth.uid())
  );

-- ============================================================
-- STORAGE BUCKETS
-- (Run these via Supabase dashboard or CLI)
-- ============================================================
-- supabase storage create project-photos --public=false
-- supabase storage create renders --public=true
-- supabase storage create permits --public=false
-- supabase storage create warranties --public=false
-- supabase storage create change-order-docs --public=false
-- supabase storage create company-docs --public=false
-- supabase storage create progress-photos --public=false
