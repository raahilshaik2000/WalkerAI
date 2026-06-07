import {
  WASTE_FACTORS,
  buildPricingPromptSection,
  calculateEstimateConfidence,
  calculateQuantities,
  estimateProjectCost,
} from '../src/data/pricing-reference';

describe('pricing reference engine', () => {
  it('uses exact opening dimensions when calculating net wall area and casing', () => {
    const quantities = calculateQuantities({
      lengthFt: '10',
      widthFt: '8',
      ceilingHeightFt: '8',
      numDoors: '1',
      numWindows: '1',
      doorWidthFt: '4',
      doorHeightFt: '8',
      windowWidthFt: '5',
      windowHeightFt: '4',
    });

    expect(quantities.wall_area_gross_sqf).toBe(288);
    expect(quantities.wall_area_net_sqf).toBe(236);
    expect(quantities.baseboard_lf).toBe(32);
    expect(quantities.casing_lf).toBe(38);
  });

  it('uses the same decimal parsing as the measurement form for quantity takeoff', () => {
    const quantities = calculateQuantities({
      lengthFt: '3,5',
      widthFt: '3.5',
      ceilingHeightFt: '2·5',
      numDoors: '0',
      numWindows: '0',
    });

    expect(quantities.floor_area_sqf).toBe(12);
    expect(quantities.wall_area_gross_sqf).toBe(35);
  });

  it('does not apply tile waste twice in bathroom floor material estimates', () => {
    const quantities = calculateQuantities({
      lengthFt: '10',
      widthFt: '10',
      ceilingHeightFt: '8',
      numDoors: '0',
      numWindows: '0',
    });

    const estimate = estimateProjectCost({
      roomType: 'bathroom',
      qualityTier: 'mid-range',
      answers: { b_tile: 'b_tile_full', b_shower: 'b_sh_keep' },
      quantities,
    });

    const floorTile = estimate.lineItems.find((item) => item.label === 'Floor tile (material)');
    expect(floorTile?.avgCad).toBe(770);
  });

  it('calculates confidence deterministically from known risk factors', () => {
    const confidence = calculateEstimateConfidence({
      roomType: 'bathroom',
      answers: { b_plumbing: 'b_plumb_major' },
      hasMeasurements: false,
      analysisResult: null,
    });

    expect(confidence.score).toBe(70);
    expect(confidence.notes).toContain('possible drain or plumbing relocation');
    expect(confidence.notes).toContain('measurements not provided');
  });

  it('deducts confidence for one or two uncertain answers before the 3+ threshold', () => {
    const confidence = calculateEstimateConfidence({
      roomType: 'kitchen',
      answers: {
        k_layout: 'known',
        k_flooring: 'not_sure',
        k_appliances: 'unknown',
      },
      hasMeasurements: true,
      analysisResult: null,
    });

    expect(confidence.score).toBe(86);
    expect(confidence.notes).toContain('2 uncertain answers');
  });

  it('adds PDF-defined automatic repair allowances for triggered work', () => {
    const estimate = estimateProjectCost({
      roomType: 'bathroom',
      qualityTier: 'mid-range',
      answers: {
        b_tile: 'b_tile_full',
        b_shower: 'b_sh_walkin',
        b_plumbing: 'b_plumb_major',
      },
      quantities: null,
    });

    expect(estimate.lineItems).toEqual(expect.arrayContaining([
      { label: 'Plumbing wall repair allowance', avgCad: 200 },
      { label: 'Drain relocation floor repair allowance', avgCad: 350 },
      { label: 'Electrical wall access repair allowance', avgCad: 150 },
      { label: 'Tile demolition patch allowance', avgCad: 200 },
    ]));
  });

  it('does not charge full kitchen replacement lines for keep selections', () => {
    const estimate = estimateProjectCost({
      roomType: 'kitchen',
      qualityTier: 'mid-range',
      answers: {
        k_cabinets: 'k_cab_keep',
        k_countertops: 'k_ct_keep',
        k_flooring: 'k_floor_keep',
      },
      quantities: null,
    });

    const labels = estimate.lineItems.map((item) => item.label);
    expect(labels).not.toContain('Cabinet demolition & removal');
    expect(labels).not.toContain('Semi-custom cabinets (material)');
    expect(labels).not.toContain('Cabinet installation (labour)');
    expect(labels).not.toContain('Countertop (supply, fabricate & install)');
    expect(labels).not.toContain('Floor removal');
    expect(labels).not.toContain('Flooring material');
    expect(labels).not.toContain('Flooring installation (labour)');
  });

  it('applies Canadian regional budget adjustment from the project province', () => {
    const baseInput = {
      roomType: 'kitchen' as const,
      qualityTier: 'mid-range' as const,
      answers: {
        k_cabinets: 'k_cab_full',
        k_countertops: 'k_ct_quartz',
        k_flooring: 'k_floor_full',
      },
      quantities: null,
    };

    const ontario = estimateProjectCost({ ...baseInput, provinceCode: 'ON' });
    const bc = estimateProjectCost({ ...baseInput, provinceCode: 'BC' });
    const quebec = estimateProjectCost({ ...baseInput, provinceCode: 'QC' });

    expect(bc.avgDollars).toBeGreaterThan(ontario.avgDollars);
    expect(quebec.avgDollars).toBeLessThan(ontario.avgDollars);
    expect(Math.round((bc.avgDollars / ontario.avgDollars) * 100)).toBe(113);
    expect(Math.round((quebec.avgDollars / ontario.avgDollars) * 100)).toBe(80);
  });

  it('treats kitchen refacing and floor repair as limited work, not full replacement', () => {
    const estimate = estimateProjectCost({
      roomType: 'kitchen',
      qualityTier: 'mid-range',
      answers: {
        k_cabinets: 'k_cab_reface',
        k_countertops: 'k_ct_keep',
        k_flooring: 'k_floor_repair',
      },
      quantities: null,
    });

    const labels = estimate.lineItems.map((item) => item.label);
    expect(labels).not.toContain('Cabinet demolition & removal');
    expect(labels).not.toContain('Semi-custom cabinets (material)');
    expect(labels).not.toContain('Cabinet installation (labour)');
    expect(labels).not.toContain('Floor removal');
    expect(labels).not.toContain('Flooring material');
    expect(labels).not.toContain('Flooring installation (labour)');
    expect(labels).toContain('Floor repair/refinish allowance');
  });

  it('does not add bathroom demolition/removal lines for kept tile, vanity, toilet, and shower layout', () => {
    const estimate = estimateProjectCost({
      roomType: 'bathroom',
      qualityTier: 'mid-range',
      answers: {
        b_shower: 'b_sh_keep',
        b_tile: 'b_tile_keep',
        b_vanity: 'b_van_keep',
        b_toilet: 'b_toil_keep',
        b_plumbing: 'b_plumb_none',
      },
      quantities: null,
    });

    const labels = estimate.lineItems.map((item) => item.label);
    expect(labels).not.toContain('Full bathroom demolition');
    expect(labels).not.toContain('Tile demolition (partial)');
    expect(labels).not.toContain('Vanity removal');
    expect(labels).not.toContain('Toilet removal');
    expect(labels).not.toContain('Vanity & fixture removal');
    expect(labels).not.toContain('Tile demolition patch allowance');
  });

  it('keeps waste factors aligned with the source measurement spec', () => {
    expect(WASTE_FACTORS.tile_standard).toBe(0.10);
    expect(WASTE_FACTORS.tile_complex).toBe(0.15);
    expect(WASTE_FACTORS.flooring_standard).toBe(0.07);
    expect(WASTE_FACTORS.flooring_complex).toBe(0.10);
    expect(WASTE_FACTORS.drywall).toBe(0.08);
    expect(WASTE_FACTORS.paint).toBe(0.05);

    const prompt = buildPricingPromptSection();
    expect(prompt).toContain('Drywall sheets: 8%');
    expect(prompt).toContain('Paint: 5%');
  });
});
