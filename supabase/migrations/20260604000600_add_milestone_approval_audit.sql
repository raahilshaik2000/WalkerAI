-- Store homeowner approval audit data when milestone escrow is released.

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id);
