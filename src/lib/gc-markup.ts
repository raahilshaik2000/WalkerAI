export interface GcMarkupInput {
  baseMinCents: number | null | undefined;
  baseMaxCents: number | null | undefined;
  markupPct: number;
  conciergeFeePct?: number;
}

export interface GcMarkupSummary {
  baseMinCents: number;
  baseMaxCents: number;
  markupMinCents: number;
  markupMaxCents: number;
  conciergeFeeMinCents: number;
  conciergeFeeMaxCents: number;
  homeownerTotalMinCents: number;
  homeownerTotalMaxCents: number;
  gcRevenueMinCents: number;
  gcRevenueMaxCents: number;
}

function normalizePercent(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function centsFromPercent(cents: number, pct: number): number {
  return Math.round(cents * (pct / 100));
}

export function calculateGcMarkup(input: GcMarkupInput): GcMarkupSummary | null {
  const baseMin = input.baseMinCents ?? input.baseMaxCents ?? null;
  const baseMax = input.baseMaxCents ?? input.baseMinCents ?? null;
  if (baseMin == null || baseMax == null) return null;
  if (!Number.isFinite(baseMin) || !Number.isFinite(baseMax) || baseMin < 0 || baseMax < 0) return null;

  const normalizedMin = Math.min(baseMin, baseMax);
  const normalizedMax = Math.max(baseMin, baseMax);
  const markupPct = normalizePercent(input.markupPct);
  const conciergeFeePct = normalizePercent(input.conciergeFeePct);

  const markupMin = centsFromPercent(normalizedMin, markupPct);
  const markupMax = centsFromPercent(normalizedMax, markupPct);
  const conciergeMin = centsFromPercent(normalizedMin, conciergeFeePct);
  const conciergeMax = centsFromPercent(normalizedMax, conciergeFeePct);

  return {
    baseMinCents: normalizedMin,
    baseMaxCents: normalizedMax,
    markupMinCents: markupMin,
    markupMaxCents: markupMax,
    conciergeFeeMinCents: conciergeMin,
    conciergeFeeMaxCents: conciergeMax,
    homeownerTotalMinCents: normalizedMin + markupMin + conciergeMin,
    homeownerTotalMaxCents: normalizedMax + markupMax + conciergeMax,
    gcRevenueMinCents: markupMin + conciergeMin,
    gcRevenueMaxCents: markupMax + conciergeMax,
  };
}
