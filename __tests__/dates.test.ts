import { isValidIsoDate, normalizeOptionalIsoDate } from '../src/lib/dates';

describe('ISO date helpers', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidIsoDate('2026-06-15')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects malformed dates and JavaScript rollover dates', () => {
    expect(isValidIsoDate('2026-2-5')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2026-06-15T00:00:00Z')).toBe(false);
  });

  it('normalizes optional date fields', () => {
    expect(normalizeOptionalIsoDate(' 2026-06-15 ', 'warranty expiry')).toBe('2026-06-15');
    expect(normalizeOptionalIsoDate('   ', 'warranty expiry')).toBeNull();
    expect(() => normalizeOptionalIsoDate('2026-02-31', 'warranty expiry')).toThrow(
      'Enter warranty expiry as a valid YYYY-MM-DD date, or leave it blank.'
    );
  });
});
