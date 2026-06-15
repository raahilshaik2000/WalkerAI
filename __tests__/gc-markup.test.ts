import { calculateGcMarkup } from '../src/lib/gc-markup';

describe('GC markup engine', () => {
  it('calculates homeowner total and GC revenue from an estimate range', () => {
    expect(calculateGcMarkup({
      baseMinCents: 1000000,
      baseMaxCents: 2000000,
      markupPct: 15,
      conciergeFeePct: 10,
    })).toEqual({
      baseMinCents: 1000000,
      baseMaxCents: 2000000,
      markupMinCents: 150000,
      markupMaxCents: 300000,
      conciergeFeeMinCents: 100000,
      conciergeFeeMaxCents: 200000,
      homeownerTotalMinCents: 1250000,
      homeownerTotalMaxCents: 2500000,
      gcRevenueMinCents: 250000,
      gcRevenueMaxCents: 500000,
    });
  });

  it('normalizes reversed ranges and missing one-sided estimates', () => {
    expect(calculateGcMarkup({
      baseMinCents: 2000000,
      baseMaxCents: 1000000,
      markupPct: 10,
      conciergeFeePct: 0,
    })?.homeownerTotalMinCents).toBe(1100000);

    expect(calculateGcMarkup({
      baseMinCents: null,
      baseMaxCents: 1000000,
      markupPct: 10,
      conciergeFeePct: 5,
    })?.homeownerTotalMaxCents).toBe(1150000);
  });

  it('returns null when no usable estimate exists', () => {
    expect(calculateGcMarkup({
      baseMinCents: null,
      baseMaxCents: null,
      markupPct: 15,
    })).toBeNull();
  });
});
