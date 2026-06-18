-- Existing cross-role professional profiles should not remain marketplace-ready
-- after account-type boundaries are enforced. Preserve rows for support review,
-- but remove verified status when the owning public.users.role does not match.
--
-- These updates intentionally touch rows that violate the role-boundary
-- triggers installed by earlier migrations. Disable only those boundary
-- triggers during this cleanup, then re-enable them immediately.

ALTER TABLE public.companies DISABLE TRIGGER guard_company_profile_user_role_trigger;
UPDATE public.companies c
SET verified = FALSE
WHERE verified IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = c.user_id
       AND u.role = 'company'
  );
ALTER TABLE public.companies ENABLE TRIGGER guard_company_profile_user_role_trigger;

ALTER TABLE public.suppliers DISABLE TRIGGER guard_supplier_profile_user_role_trigger;
UPDATE public.suppliers s
SET verified = FALSE
WHERE verified IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = s.user_id
       AND u.role = 'supplier'
  );
ALTER TABLE public.suppliers ENABLE TRIGGER guard_supplier_profile_user_role_trigger;

ALTER TABLE public.general_contractors DISABLE TRIGGER guard_gc_profile_user_role_trigger;
UPDATE public.general_contractors gc
SET verified = FALSE
WHERE verified IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = gc.user_id
       AND u.role = 'general_contractor'
  );
ALTER TABLE public.general_contractors ENABLE TRIGGER guard_gc_profile_user_role_trigger;
