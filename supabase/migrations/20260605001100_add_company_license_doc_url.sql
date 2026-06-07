-- Contractor onboarding stores optional license document paths separately from
-- insurance and WCB documents. Older schemas only had license_number.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS license_doc_url TEXT;
