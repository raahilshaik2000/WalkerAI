import {
  nextCatalogSetupRoute,
  parseNonNegativeDays,
  parsePositiveCadToCents,
  selectedSupplierCategories,
} from '../src/lib/supplier-catalog';

describe('supplier catalog helpers', () => {
  it('filters supplier categories to supported material categories', () => {
    expect(selectedSupplierCategories(['Cabinets & Storage', 'Unknown', 42, 'Other'])).toEqual([
      'Cabinets & Storage',
      'Other',
    ]);
  });

  it('routes incomplete supplier setup to the next catalog prerequisite', () => {
    expect(nextCatalogSetupRoute(null)).toBe('SupplierBusinessOnboarding');
    expect(nextCatalogSetupRoute({ license_number: null, categories: ['Other'] })).toBe('SupplierLicenseOnboarding');
    expect(nextCatalogSetupRoute({ license_number: 'LIC-1', categories: [] })).toBe('SupplierCategoriesOnboarding');
    expect(nextCatalogSetupRoute({ license_number: 'LIC-1', categories: ['Other'] })).toBeNull();
  });

  it('parses valid catalog price and lead-time inputs', () => {
    expect(parsePositiveCadToCents('12.34')).toBe(1234);
    expect(parsePositiveCadToCents('12,34')).toBe(1234);
    expect(parsePositiveCadToCents('12·34')).toBe(1234);
    expect(parsePositiveCadToCents(' 1 ')).toBe(100);
    expect(parseNonNegativeDays('0')).toBe(0);
    expect(parseNonNegativeDays('14')).toBe(14);
  });

  it('rejects malformed or database-unsafe catalog numbers', () => {
    expect(parsePositiveCadToCents('0')).toBeNull();
    expect(parsePositiveCadToCents('-1')).toBeNull();
    expect(parsePositiveCadToCents('1.234')).toBeNull();
    expect(parsePositiveCadToCents('1,2,3')).toBeNull();
    expect(parsePositiveCadToCents('21474836.48')).toBeNull();
    expect(parseNonNegativeDays('-1')).toBeNull();
    expect(parseNonNegativeDays('1.5')).toBeNull();
  });
});
