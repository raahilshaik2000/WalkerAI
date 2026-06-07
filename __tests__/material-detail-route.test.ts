import { parseMaterialDetailRouteParams } from '@/lib/material-detail-route';

describe('parseMaterialDetailRouteParams', () => {
  it('accepts and normalizes valid material route params', () => {
    expect(parseMaterialDetailRouteParams({
      materialIndex: 2,
      materialName: '  Quartz countertop ',
      materialQualityTier: 'luxury',
      quantity: 34.5,
      unit: ' sq ft ',
    })).toEqual({
      materialIndex: 2,
      materialName: 'Quartz countertop',
      materialQualityTier: 'luxury',
      quantity: 34.5,
      unit: 'sq ft',
    });
  });

  it('allows omitted quality tier', () => {
    expect(parseMaterialDetailRouteParams({
      materialIndex: 0,
      materialName: 'Paint',
      quantity: 2,
      unit: 'gal',
    })).toEqual({
      materialIndex: 0,
      materialName: 'Paint',
      materialQualityTier: undefined,
      quantity: 2,
      unit: 'gal',
    });
  });

  it('rejects missing or malformed required params', () => {
    expect(parseMaterialDetailRouteParams(undefined)).toBeNull();
    expect(parseMaterialDetailRouteParams({ materialName: 'Paint', quantity: 1, unit: 'gal' })).toBeNull();
    expect(parseMaterialDetailRouteParams({ materialIndex: -1, materialName: 'Paint', quantity: 1, unit: 'gal' })).toBeNull();
    expect(parseMaterialDetailRouteParams({ materialIndex: 0, materialName: '', quantity: 1, unit: 'gal' })).toBeNull();
    expect(parseMaterialDetailRouteParams({ materialIndex: 0, materialName: 'Paint', quantity: 0, unit: 'gal' })).toBeNull();
    expect(parseMaterialDetailRouteParams({ materialIndex: 0, materialName: 'Paint', quantity: 1, unit: '' })).toBeNull();
    expect(parseMaterialDetailRouteParams({
      materialIndex: 0,
      materialName: 'Paint',
      materialQualityTier: 'premium',
      quantity: 1,
      unit: 'gal',
    })).toBeNull();
  });
});
