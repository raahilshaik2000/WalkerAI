-- GC trade-slot details should not be exposed during a pending invitation.
-- Active GCs need the records for scheduling/trade coordination, and completed
-- assignments keep read access for project history and closeout review.

DROP POLICY IF EXISTS "slots_gc_managed_read" ON public.project_slots;
CREATE POLICY "slots_gc_managed_read" ON public.project_slots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.general_contractor_projects gcp
      JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
      WHERE gcp.project_id = project_slots.project_id
        AND gcp.status IN ('active', 'completed')
        AND gc.user_id = (SELECT auth.uid())
    )
  );
