-- Warranty documents are part of project closeout. Contractors and homeowners
-- who are project participants can add/view warranty rows, and the private
-- warranties storage bucket is readable only by those participants.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('warranties', 'warranties', false, 10485760, NULL)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "warranties_participants" ON public.warranties;
DROP POLICY IF EXISTS "warranties_homeowner" ON public.warranties;
DROP POLICY IF EXISTS "warranties_select_participants" ON public.warranties;
DROP POLICY IF EXISTS "warranties_insert_participants" ON public.warranties;

CREATE POLICY "warranties_select_participants" ON public.warranties
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = warranties.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.companies c ON c.id = q.company_id
      WHERE q.project_id = warranties.project_id
        AND q.status = 'approved'
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = warranties.project_id
        AND ps.status IN ('filled', 'scheduled')
        AND c.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "warranties_insert_participants" ON public.warranties
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = warranties.project_id
        AND p.homeowner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.companies c ON c.id = q.company_id
      WHERE q.project_id = warranties.project_id
        AND q.status = 'approved'
        AND c.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_slots ps
      JOIN public.companies c ON c.id = ps.assigned_company_id
      WHERE ps.project_id = warranties.project_id
        AND ps.status IN ('filled', 'scheduled')
        AND c.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "warranties_participant_insert" ON storage.objects;
DROP POLICY IF EXISTS "warranties_participant_select" ON storage.objects;
DROP POLICY IF EXISTS "warranties_participant_update" ON storage.objects;

CREATE POLICY "warranties_participant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'warranties'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.homeowner_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.quotes q
            JOIN public.companies c ON c.id = q.company_id
            WHERE q.project_id = p.id
              AND q.status = 'approved'
              AND c.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.project_slots ps
            JOIN public.companies c ON c.id = ps.assigned_company_id
            WHERE ps.project_id = p.id
              AND ps.status IN ('filled', 'scheduled')
              AND c.user_id = (SELECT auth.uid())
          )
        )
    )
  );

CREATE POLICY "warranties_participant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'warranties'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.homeowner_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.quotes q
            JOIN public.companies c ON c.id = q.company_id
            WHERE q.project_id = p.id
              AND q.status = 'approved'
              AND c.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.project_slots ps
            JOIN public.companies c ON c.id = ps.assigned_company_id
            WHERE ps.project_id = p.id
              AND ps.status IN ('filled', 'scheduled')
              AND c.user_id = (SELECT auth.uid())
          )
        )
    )
  );

CREATE POLICY "warranties_participant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'warranties'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.homeowner_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.quotes q
            JOIN public.companies c ON c.id = q.company_id
            WHERE q.project_id = p.id
              AND q.status = 'approved'
              AND c.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.project_slots ps
            JOIN public.companies c ON c.id = ps.assigned_company_id
            WHERE ps.project_id = p.id
              AND ps.status IN ('filled', 'scheduled')
              AND c.user_id = (SELECT auth.uid())
          )
        )
    )
  )
  WITH CHECK (
    bucket_id = 'warranties'
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (
          p.homeowner_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.quotes q
            JOIN public.companies c ON c.id = q.company_id
            WHERE q.project_id = p.id
              AND q.status = 'approved'
              AND c.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.project_slots ps
            JOIN public.companies c ON c.id = ps.assigned_company_id
            WHERE ps.project_id = p.id
              AND ps.status IN ('filled', 'scheduled')
              AND c.user_id = (SELECT auth.uid())
          )
        )
    )
  );
