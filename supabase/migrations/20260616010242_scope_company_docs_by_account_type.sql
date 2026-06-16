-- The shared company-docs bucket now stores company, supplier, and GC setup
-- documents. Scope paths by account role so the new GC folder is not writable
-- by any arbitrary authenticated account that happens to own the second path
-- segment.

CREATE OR REPLACE FUNCTION public.can_access_company_doc_path(p_object_name TEXT)
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
       -- Existing company onboarding documents use {user_id}/...
       current_user_role.role = 'company'
       AND path.segment_1 = (SELECT auth.uid())::text
     )
     OR (
       -- Existing supplier onboarding documents use supplier-licenses/{user_id}/...
       current_user_role.role = 'supplier'
       AND path.segment_1 = 'supplier-licenses'
       AND path.segment_2 = (SELECT auth.uid())::text
     )
     OR (
       -- GC license/insurance setup uses general-contractors/{user_id}/...
       current_user_role.role = 'general_contractor'
       AND path.segment_1 = 'general-contractors'
       AND path.segment_2 = (SELECT auth.uid())::text
     )
     OR (
       -- Active verified GCs can attach external trade docs to managed projects.
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
            AND gcp.status = 'active'
            AND gcp.project_id::text = path.segment_3
       )
     )
  );
$$;

DROP POLICY IF EXISTS "company_docs_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "company_docs_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "company_docs_owner_update" ON storage.objects;

CREATE POLICY "company_docs_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-docs'
    AND public.can_access_company_doc_path(name)
  );

CREATE POLICY "company_docs_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-docs'
    AND public.can_access_company_doc_path(name)
  );

CREATE POLICY "company_docs_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-docs'
    AND public.can_access_company_doc_path(name)
  )
  WITH CHECK (
    bucket_id = 'company-docs'
    AND public.can_access_company_doc_path(name)
  );

REVOKE ALL ON FUNCTION public.can_access_company_doc_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_company_doc_path(TEXT) TO authenticated;
