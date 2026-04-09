-- Add commission_rate to quotes table
-- Used by release-milestone edge function to calculate the 10% platform fee.
-- Defaults to 0.10 (10%) for all existing and new quotes.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4,3) NOT NULL DEFAULT 0.10;
