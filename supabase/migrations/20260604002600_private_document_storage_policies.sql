-- Private document buckets need explicit storage.objects policies. Bucket
-- privacy only prevents public reads; it does not grant authenticated uploads.

DROP POLICY IF EXISTS "company_docs_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "company_docs_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "company_docs_owner_update" ON storage.objects;

CREATE POLICY "company_docs_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-docs'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (storage.foldername(name))[2] = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "company_docs_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-docs'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (storage.foldername(name))[2] = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "company_docs_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-docs'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (storage.foldername(name))[2] = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    bucket_id = 'company-docs'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (storage.foldername(name))[2] = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "permits_participant_insert" ON storage.objects;
DROP POLICY IF EXISTS "permits_participant_select" ON storage.objects;
DROP POLICY IF EXISTS "permits_participant_update" ON storage.objects;

CREATE POLICY "permits_participant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.homeowner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "permits_participant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'permits'
    AND (
      EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.homeowner_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.quotes q ON q.project_id = p.id
        JOIN public.companies c ON c.id = q.company_id
        WHERE p.id::text = (storage.foldername(name))[1]
          AND q.status = 'approved'
          AND c.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.project_slots ps
        JOIN public.companies c ON c.id = ps.assigned_company_id
        WHERE ps.project_id::text = (storage.foldername(name))[1]
          AND ps.status IN ('filled', 'scheduled')
          AND c.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "permits_participant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.homeowner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'permits'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND p.homeowner_id = (SELECT auth.uid())
    )
  );
