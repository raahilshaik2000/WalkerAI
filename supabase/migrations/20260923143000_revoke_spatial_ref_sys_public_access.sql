-- Lock down public and anon access to PostGIS system reference table
DO $$
BEGIN
  BEGIN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM anon, authenticated, public;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not revoke on spatial_ref_sys: %', SQLERRM;
  END;
END $$;
