-- External trade documents live in the shared company-docs bucket, so tighten
-- the storage helper as well as the RPC. GC onboarding document paths must stay
-- writable before verification; only external-trades uploads require a complete
-- verified GC profile and active project management.

CREATE OR REPLACE FUNCTION private.can_access_company_doc_path(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  WITH current_user_role AS (
    SELECT u.role
      FROM public.users u
     WHERE u.id = (SELECT auth.uid())
  ),
  path AS (
    SELECT
      (storage.foldername(p_object_name))[1] AS segment_1,
      (storage.foldername(p_object_name))[2] AS segment_2,
      (storage.foldername(p_object_name))[3] AS segment_3
  )
  SELECT EXISTS (
    SELECT 1
      FROM path, current_user_role
     WHERE (
       current_user_role.role = 'company'
       AND path.segment_1 = (SELECT auth.uid())::text
     )
     OR (
       current_user_role.role = 'supplier'
       AND path.segment_1 = 'supplier-licenses'
       AND path.segment_2 = (SELECT auth.uid())::text
     )
     OR (
       current_user_role.role = 'general_contractor'
       AND path.segment_1 = 'general-contractors'
       AND path.segment_2 = (SELECT auth.uid())::text
     )
     OR (
       current_user_role.role = 'general_contractor'
       AND path.segment_1 = 'external-trades'
       AND path.segment_2 = (SELECT auth.uid())::text
       AND EXISTS (
         SELECT 1
           FROM public.general_contractors gc
           JOIN public.general_contractor_projects gcp
             ON gcp.general_contractor_id = gc.id
          WHERE gc.user_id = (SELECT auth.uid())
            AND gc.verified IS TRUE
            AND NULLIF(TRIM(gc.business_name), '') IS NOT NULL
            AND NULLIF(TRIM(gc.city), '') IS NOT NULL
            AND NULLIF(TRIM(gc.province), '') IS NOT NULL
            AND gc.lat IS NOT NULL
            AND gc.lng IS NOT NULL
            AND NULLIF(TRIM(gc.license_number), '') IS NOT NULL
            AND NULLIF(TRIM(gc.license_doc_url), '') IS NOT NULL
            AND NULLIF(TRIM(gc.insurance_doc_url), '') IS NOT NULL
            AND gcp.status = 'active'
            AND gcp.project_id::text = path.segment_3
       )
     )
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_company_doc_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_company_doc_path(TEXT) TO authenticated;
