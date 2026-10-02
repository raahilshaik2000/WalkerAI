DO $$
DECLARE
  v_user_id UUID := '31aa144f-7aca-4817-b7a2-4573aa54734b';
  v_supplier_id UUID;
BEGIN
  -- 1. Ensure public.users has role 'supplier'
  INSERT INTO public.users (id, email, role, full_name)
  VALUES (v_user_id, 'sjlyrics198@gmail.com', 'supplier', 'SJ Building Supply')
  ON CONFLICT (id) DO UPDATE
  SET role = 'supplier';

  -- 2. Ensure supplier row exists and is verified = true
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE user_id = v_user_id;

  IF v_supplier_id IS NOT NULL THEN
    UPDATE public.suppliers
    SET verified = TRUE,
        business_name = COALESCE(business_name, 'SJ Building Supply'),
        service_radius_km = COALESCE(service_radius_km, 100),
        city = COALESCE(city, 'Toronto'),
        province = COALESCE(province, 'ON'),
        lat = COALESCE(lat, 43.6532),
        lng = COALESCE(lng, -79.3832),
        location = COALESCE(location, ST_SetSRID(ST_MakePoint(-79.3832, 43.6532), 4326)::geography),
        license_number = COALESCE(license_number, 'SUP-ON-2026-8812'),
        categories = ARRAY[
          'Cabinets & Storage',
          'Countertops & Surfaces',
          'Tile & Flooring',
          'Plumbing Fixtures',
          'Lighting & Electrical',
          'Appliances',
          'Paint & Wall Coverings',
          'Other'
        ]
    WHERE id = v_supplier_id;
  ELSE
    INSERT INTO public.suppliers (
      user_id,
      business_name,
      verified,
      city,
      province,
      lat,
      lng,
      location,
      service_radius_km,
      license_number,
      categories
    ) VALUES (
      v_user_id,
      'SJ Building Supply',
      TRUE,
      'Toronto',
      'ON',
      43.6532,
      -79.3832,
      ST_SetSRID(ST_MakePoint(-79.3832, 43.6532), 4326)::geography,
      100,
      'SUP-ON-2026-8812',
      ARRAY[
        'Cabinets & Storage',
        'Countertops & Surfaces',
        'Tile & Flooring',
        'Plumbing Fixtures',
        'Lighting & Electrical',
        'Appliances',
        'Paint & Wall Coverings',
        'Other'
      ]
    );
  END IF;
END $$;
