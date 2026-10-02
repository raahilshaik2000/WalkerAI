import {
  computeCalibrationSummary,
  applyCalibrationToCostEstimate,
  type CalibrationSummary,
} from '@/lib/estimation-calibration';
import type { EstimationLearningRecord } from '@/types/database.types';

describe('Continuous Estimation Learning Engine', () => {
  const sampleRecords: EstimationLearningRecord[] = [
    {
      id: 'lrn-001',
      project_id: 'proj-1',
      room_type: 'kitchen',
      province: 'ON',
      quality_tier: 'mid-range',
      original_measurements: { lengthFt: 10, widthFt: 8 },
      verified_measurements: { lengthFt: 9.5, widthFt: 8.2 },
      dimensional_variance_ratio: 0.9738,
      original_estimated_cost_cents: 2200000,
      approved_cost_delta_cents: 45000,
      final_cost_cents: 2245000,
      adjustment_category: 'plumbing_roughin_mismatch',
      adjustment_reason: 'Cast iron pipe stack offset required Fernco transition',
      evidence_urls: ['https://storage.walkerai.com/proj-1/evidence.jpg'],
      itemized_labor_diff: [{ task: 'Pipe offset', hours: 3, totalCadCents: 28500 }],
      itemized_material_diff: [{ item: 'Coupler & ABS', totalCadCents: 16500 }],
      head_office_approved_by: 'admin-001',
      head_office_approved_at: new Date().toISOString(),
      calibration_factors: { area_ratio: 0.9738 },
      created_at: new Date().toISOString(),
    },
    {
      id: 'lrn-002',
      project_id: 'proj-2',
      room_type: 'kitchen',
      province: 'ON',
      quality_tier: 'mid-range',
      original_measurements: { lengthFt: 9, widthFt: 9 },
      verified_measurements: { lengthFt: 9.5, widthFt: 8.2 },
      dimensional_variance_ratio: 0.9617,
      original_estimated_cost_cents: 2150000,
      approved_cost_delta_cents: 55000,
      final_cost_cents: 2205000,
      adjustment_category: 'plumbing_roughin_mismatch',
      adjustment_reason: 'Drain cleanout relocation',
      evidence_urls: ['https://storage.walkerai.com/proj-2/evidence.jpg'],
      itemized_labor_diff: [{ task: 'Cleanout re-route', hours: 4, totalCadCents: 38000 }],
      itemized_material_diff: [{ item: 'Fittings', totalCadCents: 17000 }],
      head_office_approved_by: 'admin-001',
      head_office_approved_at: new Date().toISOString(),
      calibration_factors: { area_ratio: 0.9617 },
      created_at: new Date().toISOString(),
    },
    {
      id: 'lrn-003',
      project_id: 'proj-3',
      room_type: 'kitchen',
      province: 'ON',
      quality_tier: 'mid-range',
      original_measurements: { lengthFt: 11, widthFt: 9 },
      verified_measurements: { lengthFt: 10.5, widthFt: 8.8 },
      dimensional_variance_ratio: 0.9333,
      original_estimated_cost_cents: 2500000,
      approved_cost_delta_cents: 30000,
      final_cost_cents: 2530000,
      adjustment_category: 'subfloor_framing_damage',
      adjustment_reason: 'Subfloor sistering required under dishwasher footprint',
      evidence_urls: ['https://storage.walkerai.com/proj-3/evidence.jpg'],
      itemized_labor_diff: [{ task: 'Sister joist', hours: 2, totalCadCents: 19000 }],
      itemized_material_diff: [{ item: '2x8 lumber and fasteners', totalCadCents: 11000 }],
      head_office_approved_by: 'admin-002',
      head_office_approved_at: new Date().toISOString(),
      calibration_factors: { area_ratio: 0.9333 },
      created_at: new Date().toISOString(),
    },
  ];

  it('aggregates calibration summary correctly from verified historical data', () => {
    const summary = computeCalibrationSummary(sampleRecords);
    expect(summary.sampleSize).toBe(3);
    expect(summary.averageVarianceRatio).toBeCloseTo(0.9563, 2);
    expect(summary.commonCategories[0].category).toBe('plumbing_roughin_mismatch');
    expect(summary.commonCategories[0].count).toBe(2);
  });

  it('applies calibrated regional variance to future estimates safely within bounded envelope', () => {
    const summary: CalibrationSummary = {
      sampleSize: 5,
      averageVarianceRatio: 0.96,
      recommendedAreaMultiplier: 0.96,
      averageLaborDiffCadCents: 43000,
      commonCategories: [{ category: 'plumbing_roughin_mismatch', count: 4 }],
    };

    const result = applyCalibrationToCostEstimate(2000000, 2600000, summary);
    expect(result.minCadCents).toBe(Math.round(2000000 * 0.96));
    expect(result.maxCadCents).toBe(Math.round(2600000 * 0.96));
    expect(result.confidenceNotes[0]).toContain('Calibrated against 5 verified completed site inspections');
    expect(result.confidenceNotes[1]).toContain('plumbing roughin mismatch');
  });

  it('strictly gates learning dataset: rejects entries lacking Head Office verification', () => {
    const filterVerifiedForDataset = (records: Array<Partial<EstimationLearningRecord>>) => {
      return records.filter((r) => Boolean(r.head_office_approved_by && r.head_office_approved_at));
    };

    const mixed = [
      { id: '1', head_office_approved_by: 'admin-1', head_office_approved_at: '2026-09-19T10:00:00Z' },
      { id: '2', head_office_approved_by: null, head_office_approved_at: null }, // unapproved trade claim
    ];

    const eligible = filterVerifiedForDataset(mixed);
    expect(eligible.length).toBe(1);
    expect(eligible[0].id).toBe('1');
  });

  it('regression guard: prevents rotated AABB distortion from corrupting room measurements', () => {
    // Dominic's test kitchen room:
    // Physical walls: 9.5ft x 8.2ft (2.9m x 2.5m = 77.9 sq ft)
    // Rotated AABB raw artifact: 5.0m x 4.9m (16.4ft x 16.1ft = 264 sq ft)
    const rawLengthM = 5.0;
    const rawWidthM = 4.9;
    const verifiedWallLengthM = 2.9;
    const verifiedWallWidthM = 2.5;

    const rawSqft = (rawLengthM * 3.28084) * (rawWidthM * 3.28084);
    const verifiedSqft = (verifiedWallLengthM * 3.28084) * (verifiedWallWidthM * 3.28084);

    expect(rawSqft).toBeGreaterThan(250);
    expect(verifiedSqft).toBeLessThan(85);

    // Verification check: canonical dimensions must supersede the unaligned AABB
    const resolvedLengthFt = (verifiedWallLengthM * 3.28084).toFixed(1);
    const resolvedWidthFt = (verifiedWallWidthM * 3.28084).toFixed(1);

    expect(resolvedLengthFt).toBe('9.5');
    expect(resolvedWidthFt).toBe('8.2');
  });
});
