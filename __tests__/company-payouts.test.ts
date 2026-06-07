import { companyCommissionRate, companyEstimatedNetPayoutCents } from '../src/lib/company-payouts';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('company payout math', () => {
  it('uses the backend default commission rate when a quote has no rate', () => {
    expect(companyCommissionRate(null)).toBe(0.10);
    expect(companyEstimatedNetPayoutCents(10000, null)).toBe(9000);
  });

  it('uses quote-specific commission rates for expected net payout', () => {
    expect(companyEstimatedNetPayoutCents(10000, 0.12)).toBe(8800);
    expect(companyEstimatedNetPayoutCents(9999, 0.10)).toBe(8999);
  });

  it('does not return invalid or negative payout values', () => {
    expect(companyEstimatedNetPayoutCents(null, 0.10)).toBe(0);
    expect(companyEstimatedNetPayoutCents(10000, 1.5)).toBe(0);
    expect(companyEstimatedNetPayoutCents(10000, -0.2)).toBe(9000);
  });

  it('keeps company milestone payment display on net payout math', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(source).toContain("import { companyEstimatedNetPayoutCents } from '@/lib/company-payouts'");
    expect(source).toContain('commission_rate');
    expect(source).toContain('const netPayout = (milestone: Milestone) => companyEstimatedNetPayoutCents');
    expect(source).toContain("label: 'Net paid'");
    expect(source).toContain('Gross milestone total');
  });
});
