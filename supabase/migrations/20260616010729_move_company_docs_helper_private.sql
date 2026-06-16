-- Keep the privileged company-docs storage policy helper out of the exposed
-- public schema. The previous migration introduced the helper in public so this
-- migration moves the final policy dependency to a private schema, then removes
-- the public helper.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

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
    AND private.can_access_company_doc_path(name)
  );

CREATE POLICY "company_docs_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-docs'
    AND private.can_access_company_doc_path(name)
  );

CREATE POLICY "company_docs_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-docs'
    AND private.can_access_company_doc_path(name)
  )
  WITH CHECK (
    bucket_id = 'company-docs'
    AND private.can_access_company_doc_path(name)
  );

REVOKE ALL ON FUNCTION private.can_access_company_doc_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_company_doc_path(TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.can_access_company_doc_path(TEXT);
