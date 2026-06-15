-- GC discovery and future radius matching use PostGIS geography, while
-- onboarding stores plain latitude/longitude. Keep GC location synced with
-- the same pattern used by companies, suppliers, and projects.

CREATE OR REPLACE FUNCTION public.sync_general_contractor_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_general_contractors_location ON public.general_contractors;

CREATE TRIGGER trg_general_contractors_location
  BEFORE INSERT OR UPDATE OF lat, lng ON public.general_contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_general_contractor_location();
