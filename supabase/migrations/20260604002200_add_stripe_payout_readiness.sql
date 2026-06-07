-- Cache Stripe Connect payout readiness so the app can distinguish
-- "account created" from "onboarding complete and transfers enabled".

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_transfers_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_checked_at TIMESTAMPTZ;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_transfers_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_checked_at TIMESTAMPTZ;
