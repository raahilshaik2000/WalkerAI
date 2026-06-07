-- Homeowner profile address is separate from project/job addresses. Keep it
-- optional and user-owned so it can prefill future project creation flows.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;
