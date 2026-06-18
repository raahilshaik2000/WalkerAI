-- Existing cross-role professional profiles should not remain marketplace-ready
-- after account-type boundaries are enforced. Preserve rows for support review,
-- but remove verified status when the owning public.users.role does not match.

UPDATE public.companies c
SET verified = FALSE
WHERE verified IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = c.user_id
       AND u.role = 'company'
  );

UPDATE public.suppliers s
SET verified = FALSE
WHERE verified IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = s.user_id
       AND u.role = 'supplier'
  );

UPDATE public.general_contractors gc
SET verified = FALSE
WHERE verified IS TRUE
  AND NOT EXISTS (
    SELECT 1
      FROM public.users u
     WHERE u.id = gc.user_id
       AND u.role = 'general_contractor'
  );
