-- Existing company rows created before trade-slot onboarding had empty trade_types,
-- which makes them invisible to dispatch-slots matching.

UPDATE public.companies
SET
  trade_types = ARRAY['general_contractor']::public.trade_type[],
  primary_trade = COALESCE(primary_trade, 'general_contractor'::public.trade_type)
WHERE COALESCE(array_length(trade_types, 1), 0) = 0;
