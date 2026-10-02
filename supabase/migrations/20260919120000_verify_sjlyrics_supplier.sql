DO $$
DECLARE
  v_user_id UUID;
  v_supplier_id UUID;
BEGIN
  -- 1. Find user in auth.users or public.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE LOWER(email) = LOWER('Sjlyrics198@gmail.com');

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
    FROM public.users
    WHERE LOWER(email) = LOWER('Sjlyrics198@gmail.com');
  END IF;

  IF v_user_id IS NOT NULL THEN
    -- Ensure email is confirmed so user can login without email confirmation barrier
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
    WHERE id = v_user_id;

    -- Ensure public.users has role 'supplier'
    UPDATE public.users
    SET role = 'supplier'
    WHERE id = v_user_id;

    -- Ensure public.suppliers exists and is verified
    SELECT id INTO v_supplier_id
    FROM public.suppliers
    WHERE user_id = v_user_id;

    IF v_supplier_id IS NOT NULL THEN
      UPDATE public.suppliers
      SET verified = TRUE,
          service_radius_km = COALESCE(service_radius_km, 100),
          city = COALESCE(city, 'Toronto'),
          province = COALESCE(province, 'ON'),
          lat = COALESCE(lat, 43.6532),
          lng = COALESCE(lng, -79.3832),
          location = COALESCE(location, ST_SetSRID(ST_MakePoint(-79.3832, 43.6532), 4326)::geography),
          categories = CASE 
            WHEN categories IS NULL OR array_length(categories, 1) IS NULL THEN 
              ARRAY['Cabinets & Storage', 'Countertops & Surfaces', 'Tile & Flooring', 'Plumbing Fixtures', 'Lighting & Electrical', 'Appliances', 'Paint & Wall Coverings', 'Other']
            ELSE categories
          END
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
        ARRAY['Cabinets & Storage', 'Countertops & Surfaces', 'Tile & Flooring', 'Plumbing Fixtures', 'Lighting & Electrical', 'Appliances', 'Paint & Wall Coverings', 'Other']
      );
    END IF;
  END IF;
END $$;
