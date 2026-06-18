-- Authenticated marketplace browsing should not expose incomplete GC trust
-- profiles. Owners can always read their own row; everyone else only sees
-- real GC accounts that are verified and complete enough to invite.

DROP POLICY IF EXISTS "general_contractors_select_own_or_verified" ON public.general_contractors;

CREATE POLICY "general_contractors_select_own_or_verified" ON public.general_contractors
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (
      EXISTS (
        SELECT 1
          FROM public.users u
         WHERE u.id = general_contractors.user_id
           AND u.role = 'general_contractor'
      )
      AND verified = TRUE
      AND trim(COALESCE(business_name, '')) <> ''
      AND trim(COALESCE(city, '')) <> ''
      AND trim(COALESCE(province::TEXT, '')) <> ''
      AND lat IS NOT NULL
      AND lng IS NOT NULL
      AND trim(COALESCE(license_number, '')) <> ''
      AND trim(COALESCE(license_doc_url, '')) <> ''
      AND trim(COALESCE(insurance_doc_url, '')) <> ''
    )
  );

REVOKE SELECT ON public.general_contractors FROM anon;
GRANT SELECT ON public.general_contractors TO authenticated;
