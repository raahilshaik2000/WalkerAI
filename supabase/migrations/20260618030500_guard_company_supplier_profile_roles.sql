-- Company, supplier, and GC profiles are separate account-type boundaries.
-- A user can only own the profile table that matches public.users.role.

CREATE OR REPLACE FUNCTION public.guard_company_profile_user_role()
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
       AND u.role = 'company'
  ) THEN
    RAISE EXCEPTION 'Company profiles can only belong to company users';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_company_profile_user_role_trigger ON public.companies;
CREATE TRIGGER guard_company_profile_user_role_trigger
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_company_profile_user_role();

REVOKE ALL ON FUNCTION public.guard_company_profile_user_role() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_supplier_profile_user_role()
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
       AND u.role = 'supplier'
  ) THEN
    RAISE EXCEPTION 'Supplier profiles can only belong to supplier users';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_supplier_profile_user_role_trigger ON public.suppliers;
CREATE TRIGGER guard_supplier_profile_user_role_trigger
  BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_supplier_profile_user_role();

REVOKE ALL ON FUNCTION public.guard_supplier_profile_user_role() FROM PUBLIC, anon, authenticated;
