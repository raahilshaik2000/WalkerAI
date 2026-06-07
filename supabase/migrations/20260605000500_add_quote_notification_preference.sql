-- The homeowner settings UI exposes quote notifications separately from
-- milestone updates, so push preferences need a matching delivery switch.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quote_updates BOOLEAN DEFAULT TRUE;
