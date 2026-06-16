-- Verified GC marketplace browsing is an authenticated app workflow. Without
-- an explicit role target, the earlier policy applied to PUBLIC, which could
-- expose verified GC profile rows to anonymous clients if table privileges were
-- present through the Data API.

DROP POLICY IF EXISTS "general_contractors_select_own_or_verified" ON public.general_contractors;

CREATE POLICY "general_contractors_select_own_or_verified" ON public.general_contractors
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR verified = TRUE
  );

REVOKE SELECT ON public.general_contractors FROM anon;
GRANT SELECT ON public.general_contractors TO authenticated;
