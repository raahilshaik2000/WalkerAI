-- Migration 010: Add city, province, postal_code to companies
-- Fixes contractor business info save failure (these columns were missing)

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;
