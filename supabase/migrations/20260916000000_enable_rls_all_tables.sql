-- ==============================================================================
-- Migration: Ensure Row Level Security (RLS) is Enabled on ALL Public Tables
-- Resolves Supabase Security Advisor 'rls_disabled_in_public' Critical Warning
-- ==============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Loop through every application table in the public schema and enable RLS
  FOR r IN (
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
      AND tablename NOT IN ('spatial_ref_sys', 'geometry_columns', 'geography_columns')
  ) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    EXCEPTION
      WHEN insufficient_privilege THEN
        -- Ignore extension-owned tables if not owner
        RAISE NOTICE 'Skipping table % due to permissions', r.tablename;
    END;
  END LOOP;
END $$;
