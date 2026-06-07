-- Client-side project actions can notify the opposite party after the main
-- state change. Existing notification policies only allowed self-notifications,
-- which made schedule confirmation and milestone completion report failures
-- even after their database updates succeeded.

CREATE OR REPLACE FUNCTION public.notification_payload_project_id(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN NULLIF(p_payload->>'project_id', '')::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "notifications_project_participant_insert" ON public.notifications;

CREATE POLICY "notifications_project_participant_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.notification_payload_project_id(notifications.payload)
        AND (
          (
            p.homeowner_id = notifications.user_id
            AND EXISTS (
              SELECT 1
              FROM public.companies c
              WHERE c.user_id = (SELECT auth.uid())
                AND (
                  p.assigned_company_id = c.id
                  OR EXISTS (
                    SELECT 1
                    FROM public.project_slots ps
                    WHERE ps.project_id = p.id
                      AND ps.assigned_company_id = c.id
                      AND ps.status IN ('filled', 'scheduled')
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM public.quotes q
                    WHERE q.project_id = p.id
                      AND q.company_id = c.id
                  )
                )
            )
          )
          OR (
            p.homeowner_id = (SELECT auth.uid())
            AND EXISTS (
              SELECT 1
              FROM public.companies c
              WHERE c.user_id = notifications.user_id
                AND (
                  p.assigned_company_id = c.id
                  OR EXISTS (
                    SELECT 1
                    FROM public.project_slots ps
                    WHERE ps.project_id = p.id
                      AND ps.assigned_company_id = c.id
                      AND ps.status IN ('filled', 'scheduled')
                  )
                  OR EXISTS (
                    SELECT 1
                    FROM public.quotes q
                    WHERE q.project_id = p.id
                      AND q.company_id = c.id
                  )
                )
            )
          )
        )
    )
  );
