-- Account role is the router and permission boundary for every app surface.
-- Users can edit profile columns on public.users, but they must not change
-- their account type or public identity row directly after registration.

CREATE OR REPLACE FUNCTION public.guard_user_identity_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    OR NEW.email IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'User email and account role are maintained by WalkerAI authentication services';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_identity_fields_trigger ON public.users;
CREATE TRIGGER guard_user_identity_fields_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_identity_fields();

REVOKE ALL ON FUNCTION public.guard_user_identity_fields() FROM PUBLIC, anon, authenticated;

-- A General Contractor profile is a first-class fourth account type, not an
-- optional side profile on homeowner, company, or supplier accounts.

CREATE OR REPLACE FUNCTION public.guard_gc_profile_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = NEW.user_id
       AND u.role = 'general_contractor'
  ) THEN
    RAISE EXCEPTION 'General Contractor profiles can only belong to general_contractor users';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_gc_profile_user_role_trigger ON public.general_contractors;
CREATE TRIGGER guard_gc_profile_user_role_trigger
  BEFORE INSERT OR UPDATE ON public.general_contractors
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_gc_profile_user_role();

REVOKE ALL ON FUNCTION public.guard_gc_profile_user_role() FROM PUBLIC, anon, authenticated;
