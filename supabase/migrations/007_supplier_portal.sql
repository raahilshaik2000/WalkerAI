-- ============================================================
-- 007_supplier_portal.sql  — Supplier portal schema
-- ============================================================

-- 1. Extend user role enum to include 'supplier'
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('homeowner', 'company', 'supplier', 'admin'));

-- 2. Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_name      TEXT NOT NULL,
  address            TEXT,
  city               TEXT,
  province           CHAR(2),
  postal_code        TEXT,
  location           GEOGRAPHY(Point, 4326),
  service_radius_km  INTEGER NOT NULL DEFAULT 100,
  license_number     TEXT,
  license_doc_url    TEXT,
  categories         TEXT[] NOT NULL DEFAULT '{}',
  stripe_account_id  TEXT,
  verified           BOOLEAN NOT NULL DEFAULT FALSE,
  rating             NUMERIC(3,2),
  total_reviews      INTEGER NOT NULL DEFAULT 0,
  fulfillment_rate   NUMERIC(5,2),
  avg_delivery_days  INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Supplier catalog
CREATE TABLE IF NOT EXISTS supplier_catalog (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id      UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL,
  sku              TEXT,
  unit             TEXT NOT NULL,
  price_per_unit   INTEGER NOT NULL CHECK (price_per_unit >= 0),
  quality_tier     TEXT NOT NULL CHECK (quality_tier IN ('budget','mid-range','luxury')),
  brand            TEXT,
  lead_time_days   INTEGER NOT NULL DEFAULT 3,
  in_stock         BOOLEAN NOT NULL DEFAULT TRUE,
  stock_quantity   INTEGER,
  image_urls       TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Material orders (auto-generated when project goes active)
CREATE TABLE IF NOT EXISTS material_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id           UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','accepted','processing','shipped','delivered','confirmed','paid','cancelled')),
  accepted_supplier_id  UUID REFERENCES suppliers(id),
  catalog_item_id       UUID REFERENCES supplier_catalog(id),
  quantity_needed       NUMERIC NOT NULL,
  unit                  TEXT NOT NULL,
  quality_tier          TEXT CHECK (quality_tier IN ('budget','mid-range','luxury')),
  offered_price         INTEGER,
  final_price           INTEGER,
  delivery_address      TEXT,
  delivery_deadline     DATE,
  tracking_number       TEXT,
  carrier               TEXT,
  shipped_at            TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  confirmed_at          TIMESTAMPTZ,
  delivery_photo_url    TEXT,
  stripe_payment_intent_id TEXT,
  stripe_transfer_id    TEXT,
  platform_fee_pct      INTEGER NOT NULL DEFAULT 8,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Bids from multiple suppliers on one order
CREATE TABLE IF NOT EXISTS material_order_bids (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES material_orders(id) ON DELETE CASCADE,
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES supplier_catalog(id),
  price_per_unit  INTEGER NOT NULL CHECK (price_per_unit >= 0),
  total_price     INTEGER NOT NULL CHECK (total_price >= 0),
  lead_time_days  INTEGER,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','selected','rejected')),
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, supplier_id)
);

-- 6. Supplier reviews (left by contractors after material delivery)
CREATE TABLE IF NOT EXISTS supplier_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES material_orders(id) ON DELETE CASCADE,
  supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  reviewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  on_time       BOOLEAN,
  quality_match BOOLEAN,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, reviewer_id)
);

-- 7. Extend materials table for order tracking
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS material_order_id UUID REFERENCES material_orders(id),
  ADD COLUMN IF NOT EXISTS supplier_notes TEXT;

-- 8. Auto-update updated_at on material_orders
CREATE OR REPLACE FUNCTION update_material_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER material_orders_updated_at
  BEFORE UPDATE ON material_orders
  FOR EACH ROW EXECUTE FUNCTION update_material_orders_updated_at();

-- 9. Recalculate supplier rating after review
CREATE OR REPLACE FUNCTION update_supplier_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE suppliers
  SET
    rating = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM supplier_reviews WHERE supplier_id = NEW.supplier_id),
    total_reviews = (SELECT COUNT(*) FROM supplier_reviews WHERE supplier_id = NEW.supplier_id)
  WHERE id = NEW.supplier_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_rating_update
  AFTER INSERT OR UPDATE ON supplier_reviews
  FOR EACH ROW EXECUTE FUNCTION update_supplier_rating();

-- 10. Find suppliers within radius of a project
CREATE OR REPLACE FUNCTION suppliers_within_radius(
  proj_id UUID,
  category_filter TEXT DEFAULT NULL
)
RETURNS SETOF suppliers LANGUAGE plpgsql AS $$
DECLARE
  proj_location GEOGRAPHY;
BEGIN
  SELECT location INTO proj_location FROM projects WHERE id = proj_id;

  RETURN QUERY
  SELECT s.*
  FROM suppliers s
  WHERE s.verified = TRUE
    AND ST_DWithin(s.location, proj_location, s.service_radius_km * 1000)
    AND (category_filter IS NULL OR category_filter = ANY(s.categories));
END;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_order_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_reviews ENABLE ROW LEVEL SECURITY;

-- Suppliers: own profile
CREATE POLICY "suppliers_own" ON suppliers
  FOR ALL USING (user_id = auth.uid());

-- Suppliers: visible to all authenticated users (for order matching)
CREATE POLICY "suppliers_read_verified" ON suppliers
  FOR SELECT USING (verified = TRUE OR user_id = auth.uid());

-- Supplier catalog: supplier manages own, all can read
CREATE POLICY "catalog_own" ON supplier_catalog
  FOR ALL USING (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "catalog_read_all" ON supplier_catalog
  FOR SELECT USING (in_stock = TRUE);

-- Material orders: complex access
CREATE POLICY "orders_supplier_read" ON material_orders
  FOR SELECT USING (
    -- Supplier can see open orders (to bid) or their own accepted orders
    status = 'open'
    OR accepted_supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "orders_homeowner_read" ON material_orders
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
  );

CREATE POLICY "orders_company_read" ON material_orders
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE assigned_company_id = auth.uid())
  );

CREATE POLICY "orders_supplier_update" ON material_orders
  FOR UPDATE USING (
    accepted_supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "orders_homeowner_update" ON material_orders
  FOR UPDATE USING (
    project_id IN (SELECT id FROM projects WHERE homeowner_id = auth.uid())
  );

-- Bids: suppliers manage own, homeowners can read bids on their orders
CREATE POLICY "bids_supplier_own" ON material_order_bids
  FOR ALL USING (
    supplier_id IN (SELECT id FROM suppliers WHERE user_id = auth.uid())
  );

CREATE POLICY "bids_homeowner_read" ON material_order_bids
  FOR SELECT USING (
    order_id IN (
      SELECT mo.id FROM material_orders mo
      JOIN projects p ON p.id = mo.project_id
      WHERE p.homeowner_id = auth.uid()
    )
  );

-- Supplier reviews: contractor writes, public reads
CREATE POLICY "reviews_write" ON supplier_reviews
  FOR INSERT WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "reviews_read" ON supplier_reviews
  FOR SELECT USING (TRUE);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_verified ON suppliers(verified);
CREATE INDEX IF NOT EXISTS idx_suppliers_location ON suppliers USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_catalog_supplier_id ON supplier_catalog(supplier_id);
CREATE INDEX IF NOT EXISTS idx_catalog_category ON supplier_catalog(category);
CREATE INDEX IF NOT EXISTS idx_material_orders_project ON material_orders(project_id);
CREATE INDEX IF NOT EXISTS idx_material_orders_status ON material_orders(status);
CREATE INDEX IF NOT EXISTS idx_material_orders_supplier ON material_orders(accepted_supplier_id);
CREATE INDEX IF NOT EXISTS idx_bids_order_id ON material_order_bids(order_id);
CREATE INDEX IF NOT EXISTS idx_bids_supplier_id ON material_order_bids(supplier_id);
