-- Homeowners need to browse verified GC/Concierge accounts before inviting one
-- to manage a project. GC owners still see their own pending profile.

DROP POLICY IF EXISTS "general_contractors_select_own" ON public.general_contractors;
CREATE POLICY "general_contractors_select_own_or_verified" ON public.general_contractors
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR verified = TRUE
  );
