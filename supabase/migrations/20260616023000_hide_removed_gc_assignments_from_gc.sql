-- Removed GC assignments are retained for homeowner history, but they should
-- no longer expose assignment/contact context to the removed GC account.

DROP POLICY IF EXISTS "gc_projects_select_participants" ON public.general_contractor_projects;

CREATE POLICY "gc_projects_select_participants" ON public.general_contractor_projects
  FOR SELECT USING (
    homeowner_id = (SELECT auth.uid())
    OR (
      status <> 'removed'
      AND EXISTS (
        SELECT 1 FROM public.general_contractors gc
        WHERE gc.id = general_contractor_projects.general_contractor_id
          AND gc.user_id = (SELECT auth.uid())
      )
    )
  );
