const TRADE_LABELS: Record<string, string> = {
  // Legacy company/trade slot value. The new General Contractor account is a
  // separate role, so slot copy must not make this look like the GC account.
  general_contractor: 'Lead contractor',
  plumber: 'Plumber',
  electrician: 'Electrician',
  tile_installer: 'Tile installer',
  cabinet_installer: 'Cabinet installer',
  painter: 'Painter',
  flooring_installer: 'Flooring installer',
  drywall: 'Drywall',
  demolition: 'Demolition',
};

export function formatTradeLabel(tradeType?: string | null) {
  if (!tradeType) return null;
  return TRADE_LABELS[tradeType] ?? tradeType
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}
