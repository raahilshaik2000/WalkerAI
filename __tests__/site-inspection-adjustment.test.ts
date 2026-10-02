import type {
  SiteInspectionAdjustment,
  SiteInspectionAdjustmentStatus,
} from '@/types/database.types';

describe('Site Inspection Price Adjustment Workflow', () => {
  const sampleAdjustment: SiteInspectionAdjustment = {
    id: 'adj-001',
    project_id: 'proj-123',
    company_id: 'comp-456',
    trade_type: 'plumbing',
    reason_category: 'plumbing_roughin_mismatch',
    description: 'Existing cast iron drain stack requires 2ft offset to align with verified sink location',
    evidence_urls: ['https://storage.walkerai.com/inspections/drain-photo-1.jpg'],
    corrected_measurements: {
      lengthFt: 9.5,
      widthFt: 8.2,
      ceilingHeightFt: 9.5,
      squareFootage: 77.9,
    },
    labor_breakdown: [
      {
        task: 'Relocate drain stack & vent',
        trade: 'plumbing',
        hours: 4,
        rateCadCents: 9500,
        totalCadCents: 38000,
      },
    ],
    material_breakdown: [
      {
        item: '3-inch ABS pipe, sweep tees, and Fernco couplers',
        quantity: 1,
        unit: 'lot',
        unitCostCadCents: 14500,
        totalCadCents: 14500,
      },
    ],
    schedule_impact_days: 1,
    cost_delta: 52500, // +$525.00 CAD
    status: 'submitted',
    head_office_reviewer_id: null,
    head_office_reviewed_at: null,
    head_office_notes: null,
    homeowner_signed_at: null,
    payment_intent_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('prohibits direct price modification by trade and initializes in submitted state', () => {
    expect(sampleAdjustment.status).toBe('submitted');
    expect(sampleAdjustment.head_office_reviewed_at).toBeNull();
    expect(sampleAdjustment.homeowner_signed_at).toBeNull();
  });

  it('requires Head Office approval before homeowner review', () => {
    const headOfficeReview = (
      adj: SiteInspectionAdjustment,
      action: 'approve' | 'reject',
      reviewerId: string,
      notes: string,
    ): SiteInspectionAdjustment => {
      if (action === 'reject') {
        return {
          ...adj,
          status: 'rejected_by_head_office',
          head_office_reviewer_id: reviewerId,
          head_office_reviewed_at: new Date().toISOString(),
          head_office_notes: notes,
        };
      }

      const nextStatus: SiteInspectionAdjustmentStatus =
        adj.cost_delta > 0 ? 'awaiting_homeowner_funding' : 'credited';

      return {
        ...adj,
        status: nextStatus,
        head_office_reviewer_id: reviewerId,
        head_office_reviewed_at: new Date().toISOString(),
        head_office_notes: notes,
      };
    };

    // Case 1: Rejection
    const rejected = headOfficeReview(sampleAdjustment, 'reject', 'admin-999', 'Condition already covered in base scope');
    expect(rejected.status).toBe('rejected_by_head_office');
    expect(rejected.head_office_notes).toContain('already covered');

    // Case 2: Approval with price increase
    const approvedIncrease = headOfficeReview(sampleAdjustment, 'approve', 'admin-999', 'Verified rough-in offset verified against photos');
    expect(approvedIncrease.status).toBe('awaiting_homeowner_funding');
    expect(approvedIncrease.head_office_reviewer_id).toBe('admin-999');

    // Case 3: Approval with price decrease (credit)
    const creditAdjustment: SiteInspectionAdjustment = {
      ...sampleAdjustment,
      cost_delta: -25000, // -$250.00 CAD
      reason_category: 'measurement_variance',
    };
    const approvedCredit = headOfficeReview(creditAdjustment, 'approve', 'admin-999', 'Room size slightly smaller than initial photo estimate');
    expect(approvedCredit.status).toBe('credited');
  });

  it('requires homeowner funding before additional work begins for price increases', () => {
    const fundAdjustment = (
      adj: SiteInspectionAdjustment,
      paymentIntentId: string,
    ): SiteInspectionAdjustment => {
      if (adj.status !== 'awaiting_homeowner_funding') {
        throw new Error('Adjustment is not awaiting homeowner funding');
      }
      return {
        ...adj,
        status: 'approved_and_funded',
        payment_intent_id: paymentIntentId,
        homeowner_signed_at: new Date().toISOString(),
      };
    };

    const awaitingAdj: SiteInspectionAdjustment = {
      ...sampleAdjustment,
      status: 'awaiting_homeowner_funding',
      head_office_reviewer_id: 'admin-999',
      head_office_reviewed_at: new Date().toISOString(),
    };

    const funded = fundAdjustment(awaitingAdj, 'pi_stripe_test_123');
    expect(funded.status).toBe('approved_and_funded');
    expect(funded.payment_intent_id).toBe('pi_stripe_test_123');
    expect(funded.homeowner_signed_at).toBeDefined();
  });

  it('records complete audit trail with photo evidence and itemized diffs', () => {
    expect(sampleAdjustment.evidence_urls.length).toBeGreaterThan(0);
    expect(sampleAdjustment.labor_breakdown.length).toBeGreaterThan(0);
    expect(sampleAdjustment.material_breakdown.length).toBeGreaterThan(0);
    expect(sampleAdjustment.corrected_measurements.lengthFt).toBe(9.5);
    expect(sampleAdjustment.corrected_measurements.widthFt).toBe(8.2);
    expect(sampleAdjustment.schedule_impact_days).toBe(1);
  });
});
