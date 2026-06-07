import { normalizeCanadianProvince } from '../src/lib/canada';

describe('Canadian province normalization', () => {
  it('keeps valid province codes', () => {
    expect(normalizeCanadianProvince('ON')).toBe('ON');
    expect(normalizeCanadianProvince('ca-bc')).toBe('BC');
  });

  it('maps full province and territory names to codes', () => {
    expect(normalizeCanadianProvince('Ontario')).toBe('ON');
    expect(normalizeCanadianProvince('British Columbia')).toBe('BC');
    expect(normalizeCanadianProvince('Nova Scotia')).toBe('NS');
    expect(normalizeCanadianProvince('Prince Edward Island')).toBe('PE');
    expect(normalizeCanadianProvince('Northwest Territories')).toBe('NT');
  });

  it('rejects unknown values instead of slicing them into invalid codes', () => {
    expect(normalizeCanadianProvince('Not a province')).toBe('');
    expect(normalizeCanadianProvince('')).toBe('');
  });
});
