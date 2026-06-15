-- Store homeowner contact context on GC-managed project assignments so
-- contractor-created projects retain the client information captured at intake.

ALTER TABLE public.general_contractor_projects
  ADD COLUMN IF NOT EXISTS homeowner_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS homeowner_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS homeowner_contact_phone TEXT;

UPDATE public.general_contractor_projects gcp
   SET homeowner_contact_name = COALESCE(gcp.homeowner_contact_name, NULLIF(trim(u.full_name), '')),
       homeowner_contact_email = COALESCE(gcp.homeowner_contact_email, u.email),
       homeowner_contact_phone = COALESCE(gcp.homeowner_contact_phone, NULLIF(trim(u.phone), ''))
  FROM public.users u
 WHERE u.id = gcp.homeowner_id
   AND (
     gcp.homeowner_contact_name IS NULL
     OR gcp.homeowner_contact_email IS NULL
     OR gcp.homeowner_contact_phone IS NULL
   );

CREATE OR REPLACE FUNCTION public.populate_gc_project_homeowner_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_homeowner public.users%ROWTYPE;
BEGIN
  SELECT *
    INTO v_homeowner
    FROM public.users
   WHERE id = NEW.homeowner_id;

  NEW.homeowner_contact_name := COALESCE(
    NULLIF(trim(COALESCE(NEW.homeowner_contact_name, '')), ''),
    NULLIF(trim(COALESCE(v_homeowner.full_name, '')), '')
  );
  NEW.homeowner_contact_email := COALESCE(
    NULLIF(lower(trim(COALESCE(NEW.homeowner_contact_email, ''))), ''),
    v_homeowner.email
  );
  NEW.homeowner_contact_phone := COALESCE(
    NULLIF(trim(COALESCE(NEW.homeowner_contact_phone, '')), ''),
    NULLIF(trim(COALESCE(v_homeowner.phone, '')), '')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS populate_gc_project_homeowner_contact
  ON public.general_contractor_projects;

CREATE TRIGGER populate_gc_project_homeowner_contact
  BEFORE INSERT OR UPDATE OF homeowner_id, homeowner_contact_name, homeowner_contact_email, homeowner_contact_phone
  ON public.general_contractor_projects
  FOR EACH ROW EXECUTE FUNCTION public.populate_gc_project_homeowner_contact();
