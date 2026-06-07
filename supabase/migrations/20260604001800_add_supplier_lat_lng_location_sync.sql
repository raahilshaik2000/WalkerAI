-- Supplier dispatch uses PostGIS geography, but onboarding collects plain
-- latitude/longitude. Keep supplier location synced the same way companies and
-- projects are synced.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

CREATE OR REPLACE FUNCTION public.sync_supplier_location()
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

DROP TRIGGER IF EXISTS trg_suppliers_location ON public.suppliers;

CREATE TRIGGER trg_suppliers_location
  BEFORE INSERT OR UPDATE OF lat, lng ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_supplier_location();
