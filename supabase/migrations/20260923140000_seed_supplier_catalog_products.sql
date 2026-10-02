-- ==============================================================================
-- Migration: Seed Supplier Catalog with Rich In-Stock Products for Kitchen & Bath
-- Enables Homeowner Design & Materials Selection with Real SKUs, Brands & CAD Pricing
-- ==============================================================================

DO $$
DECLARE
  v_supplier_id UUID;
  s RECORD;
BEGIN
  -- Look for active verified supplier in the database
  SELECT id INTO v_supplier_id 
  FROM public.suppliers 
  WHERE verified = true 
  ORDER BY created_at ASC 
  LIMIT 1;

  -- Fallback if none found
  IF v_supplier_id IS NULL THEN
    SELECT id INTO v_supplier_id FROM public.suppliers LIMIT 1;
  END IF;

  IF v_supplier_id IS NOT NULL THEN
    -- Ensure supplier categories include all finish surfaces
    UPDATE public.suppliers 
    SET categories = ARRAY[
      'Cabinets & Storage',
      'Countertops & Surfaces',
      'Tile & Flooring',
      'Plumbing Fixtures',
      'Lighting & Electrical',
      'Appliances',
      'Paint & Wall Coverings',
      'Hardware & Fixtures',
      'Other'
    ]::TEXT[]
    WHERE id = v_supplier_id;

    -- Upsert products into supplier_catalog
    -- 1. Kitchen Cabinets
    INSERT INTO public.supplier_catalog (supplier_id, sku, name, description, category, brand, unit, price_per_unit, quality_tier, in_stock, stock_quantity, lead_time_days, image_urls)
    VALUES 
      (v_supplier_id, 'WKR-CAB-SHAKER-WHT', 'Craftline Shaker Cabinet Package — Pure White', 'Premium 3/4" solid birch frame shaker cabinet set with soft-close Blum hinges.', 'Cabinets & Storage', 'Craftline Canada', 'set', 480000, 'mid-range', true, 15, 7, ARRAY['https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800']),
      (v_supplier_id, 'WKR-CAB-SLAB-CHR', 'Modern Flat Slab Cabinets — Matte Charcoal', 'Sleek European frameless slab cabinets with scratch-resistant matte finish.', 'Cabinets & Storage', 'Moderna Living', 'set', 540000, 'luxury', true, 10, 10, ARRAY['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800']),
      (v_supplier_id, 'WKR-CAB-OAK-NAT', 'Natural White Oak Shaker Cabinets', 'Warm rift-cut solid white oak cabinets with natural matte lacquer finish.', 'Cabinets & Storage', 'Timberline Custom', 'set', 680000, 'luxury', true, 8, 14, ARRAY['https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800'])
    ON CONFLICT (id) DO NOTHING;

    -- 2. Countertops & Vanity Tops
    INSERT INTO public.supplier_catalog (supplier_id, sku, name, description, category, brand, unit, price_per_unit, quality_tier, in_stock, stock_quantity, lead_time_days, image_urls)
    VALUES 
      (v_supplier_id, 'WKR-CT-CALACATTA-GLD', 'Calacatta Gold Quartz Slab 3cm', 'Engineered quartz featuring warm gold and grey veining on an off-white background.', 'Countertops & Surfaces', 'Silestone by Cosentino', 'sqft', 9500, 'luxury', true, 45, 5, ARRAY['https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=800']),
      (v_supplier_id, 'WKR-CT-GRANITE-BLK', 'Midnight Honed Black Granite Slab', 'Natural black granite with soft honed matte texture, sealed for stain resistance.', 'Countertops & Surfaces', 'Stoneworx', 'sqft', 8200, 'mid-range', true, 30, 5, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800']),
      (v_supplier_id, 'WKR-VCT-CALACATTA-TOP', 'Pre-cut Calacatta Quartz Vanity Top 37"', 'Pre-fabricated 37x22" quartz vanity countertop with undermount sink cutout.', 'Countertops & Surfaces', 'Cosentino', 'units', 38000, 'mid-range', true, 20, 3, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800'])
    ON CONFLICT (id) DO NOTHING;

    -- 3. Tiles (Backsplash, Shower, Floors)
    INSERT INTO public.supplier_catalog (supplier_id, sku, name, description, category, brand, unit, price_per_unit, quality_tier, in_stock, stock_quantity, lead_time_days, image_urls)
    VALUES 
      (v_supplier_id, 'WKR-TILE-SUBWAY-ART', 'Artisan Handmade Subway Tile 3×12 — Gloss White', 'Glazed ceramic subway tile with organic handcrafted edge relief for kitchen backsplash.', 'Tile & Flooring', 'Centura Tile', 'sqft', 750, 'budget', true, 250, 2, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800']),
      (v_supplier_id, 'WKR-TILE-ZELLIGE-WHT', 'Moroccan Zellige Ceramic Tile 4×4 — Pearl White', 'Artisanal high-gloss Moroccan zellige tile with delicate tone variation.', 'Tile & Flooring', 'Ciot Canada', 'sqft', 1400, 'luxury', true, 180, 5, ARRAY['https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800']),
      (v_supplier_id, 'WKR-TILE-SHOWER-STAT', 'Statuario Polished Porcelain Tile 12×24', 'Large-format rectified porcelain shower wall tile with dramatic Italian marble veining.', 'Tile & Flooring', 'Olympia Tile', 'sqft', 850, 'mid-range', true, 320, 3, ARRAY['https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800']),
      (v_supplier_id, 'WKR-TILE-SHOWER-FLUTE', 'Fluted Matte White Ceramic Wall Tile 4×16', 'Architectural fluted wall tile ideal for modern luxury shower surrounds.', 'Tile & Flooring', 'Olympia Tile', 'sqft', 920, 'mid-range', true, 200, 4, ARRAY['https://images.unsplash.com/photo-1620626011761-996317b8d101?w=800']),
      (v_supplier_id, 'WKR-TILE-HEX-BLK', '2" Matte Black Porcelain Hexagon Mosaic', 'Slip-resistant unglazed porcelain mosaic mesh for bathroom and shower pan floors.', 'Tile & Flooring', 'Olympia Tile', 'sqft', 1150, 'mid-range', true, 160, 3, ARRAY['https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800']),
      (v_supplier_id, 'WKR-FLR-GREY-PORC', 'Concrete-Look Matte Grey Porcelain Floor Tile 12×24', 'Durable non-porous floor tile engineered for high-traffic bathrooms and mudrooms.', 'Tile & Flooring', 'Centura Tile', 'sqft', 720, 'budget', true, 400, 2, ARRAY['https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800']),
      (v_supplier_id, 'WKR-FLR-OAK-EURO', 'European Engineered White Oak Hardwood 7.5"', 'Wire-brushed 7.5" wide-plank engineered flooring with ultra-matte UV urethane finish.', 'Tile & Flooring', 'Torlys Canada', 'sqft', 890, 'luxury', true, 500, 5, ARRAY['https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800'])
    ON CONFLICT (id) DO NOTHING;

    -- 4. Bathroom Vanities
    INSERT INTO public.supplier_catalog (supplier_id, sku, name, description, category, brand, unit, price_per_unit, quality_tier, in_stock, stock_quantity, lead_time_days, image_urls)
    VALUES 
      (v_supplier_id, 'WKR-VAN-36-OAK', '36" Freestanding White Oak Vanity with Ceramic Sink', 'Solid oak frame bathroom vanity with soft-close drawers and integrated ceramic basin.', 'Cabinets & Storage', 'Aria Bath', 'units', 129900, 'mid-range', true, 12, 5, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800']),
      (v_supplier_id, 'WKR-VAN-48-BLK', '48" Matte Black Double Vanity with White Quartz Top', 'Dual-sink painted vanity with satin brass hardware and pre-drilled faucet holes.', 'Cabinets & Storage', 'Aria Bath', 'units', 179900, 'luxury', true, 8, 7, ARRAY['https://images.unsplash.com/photo-1620626011761-996317b8d101?w=800']),
      (v_supplier_id, 'WKR-VAN-60-WAL', '60" Floating Natural Walnut Double Vanity', 'Wall-mounted walnut double vanity with push-to-open drawers and solid surface basin.', 'Cabinets & Storage', 'Vanity Art Canada', 'units', 235000, 'luxury', true, 6, 10, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800'])
    ON CONFLICT (id) DO NOTHING;

    -- 5. Plumbing Fixtures
    INSERT INTO public.supplier_catalog (supplier_id, sku, name, description, category, brand, unit, price_per_unit, quality_tier, in_stock, stock_quantity, lead_time_days, image_urls)
    VALUES 
      (v_supplier_id, 'WKR-PLM-FAUCET-MB', 'Matte Black Pull-Down Kitchen Faucet', 'High-arc commercial style kitchen faucet with dual spray modes and magnetic dock.', 'Plumbing Fixtures', 'Moen Canada', 'units', 28900, 'mid-range', true, 40, 2, ARRAY['https://images.unsplash.com/photo-1585909695284-32d2985ac9c0?w=800']),
      (v_supplier_id, 'WKR-PLM-SHOWER-MB', 'Thermostatic Rain Shower Kit with Handheld — Matte Black', 'Complete 10" rainfall shower head with pressure-balancing valve and multi-spray wand.', 'Plumbing Fixtures', 'Riobel Canada', 'units', 54900, 'luxury', true, 22, 3, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800']),
      (v_supplier_id, 'WKR-PLM-VAN-FAUCET-BRS', '8" Widespread Bathroom Sink Faucet — Brushed Brass', 'Heavy solid brass bathroom faucet with ceramic disc cartridges and matching pop-up drain.', 'Plumbing Fixtures', 'Kohler Canada', 'units', 24500, 'mid-range', true, 35, 2, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800']),
      (v_supplier_id, 'WKR-PLM-TOILET-SKIRT', 'One-Piece Dual-Flush Skirted Toilet — Gloss White', 'ADA compliant comfort-height vitreous china toilet with concealed trapway.', 'Plumbing Fixtures', 'American Standard', 'units', 42000, 'budget', true, 25, 2, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800'])
    ON CONFLICT (id) DO NOTHING;

    -- 6. Paint & Wall Coverings
    INSERT INTO public.supplier_catalog (supplier_id, sku, name, description, category, brand, unit, price_per_unit, quality_tier, in_stock, stock_quantity, lead_time_days, image_urls)
    VALUES 
      (v_supplier_id, 'WKR-PNT-CHANTILLY', 'Benjamin Moore Regal Select — Chantilly Lace OC-65 (Satin)', 'Zero-VOC premium interior paint with outstanding washability for kitchens and baths.', 'Paint & Wall Coverings', 'Benjamin Moore', 'gallon', 8400, 'mid-range', true, 60, 1, ARRAY['https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800']),
      (v_supplier_id, 'WKR-PNT-CLASSICGRY', 'Benjamin Moore Regal Select — Classic Gray OC-23 (Eggshell)', 'Gentle warm gray architectural coating formulated for high-humidity living spaces.', 'Paint & Wall Coverings', 'Benjamin Moore', 'gallon', 8400, 'mid-range', true, 50, 1, ARRAY['https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800'])
    ON CONFLICT (id) DO NOTHING;

    -- 7. Hardware & Fixtures
    INSERT INTO public.supplier_catalog (supplier_id, sku, name, description, category, brand, unit, price_per_unit, quality_tier, in_stock, stock_quantity, lead_time_days, image_urls)
    VALUES 
      (v_supplier_id, 'WKR-HRD-PULL-BLK', 'Solid Brass 5" Cabinet Bar Pull — Matte Black', 'Modern architectural drawer and door pull made from solid forged brass.', 'Hardware & Fixtures', 'Richelieu Hardware', 'units', 1650, 'mid-range', true, 500, 1, ARRAY['https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800']),
      (v_supplier_id, 'WKR-HRD-MIRROR-LED', 'LED Backlit Anti-Fog Vanity Mirror 30×40"', 'Dimmable color-temperature LED mirror with built-in defogger pad and touch memory sensor.', 'Hardware & Fixtures', 'Fleurco Canada', 'units', 32000, 'mid-range', true, 18, 4, ARRAY['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800'])
    ON CONFLICT (id) DO NOTHING;

  END IF;
END $$;
