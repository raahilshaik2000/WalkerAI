import {
  formatCadCents,
  formatSignedCadCents,
  parseNonNegativeCadToCents,
  parsePositiveCadToCents,
  parseSignedCadToCents,
} from '../src/lib/currency';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('CAD currency parsing', () => {
  it('parses positive CAD amounts with common decimal separators', () => {
    expect(parsePositiveCadToCents('12.34')).toBe(1234);
    expect(parsePositiveCadToCents('12,34')).toBe(1234);
    expect(parsePositiveCadToCents('12·34')).toBe(1234);
  });

  it('allows zero only for non-negative quote-style amounts', () => {
    expect(parseNonNegativeCadToCents('0')).toBe(0);
    expect(parseNonNegativeCadToCents('0,00')).toBe(0);
    expect(parsePositiveCadToCents('0')).toBeNull();
  });

  it('rejects malformed, negative, over-precision, and database-unsafe amounts', () => {
    expect(parseNonNegativeCadToCents('-1')).toBeNull();
    expect(parseNonNegativeCadToCents('1.234')).toBeNull();
    expect(parseNonNegativeCadToCents('1,2,3')).toBeNull();
    expect(parseNonNegativeCadToCents('21474836.48')).toBeNull();
  });

  it('parses signed CAD cents for change orders without accepting stripped text', () => {
    expect(parseSignedCadToCents('+500')).toBe(50000);
    expect(parseSignedCadToCents('-200')).toBe(-20000);
    expect(parseSignedCadToCents('125.50')).toBe(12550);
    expect(parseSignedCadToCents('-125,50')).toBe(-12550);
    expect(parseSignedCadToCents('$500')).toBeNull();
    expect(parseSignedCadToCents('500abc')).toBeNull();
    expect(parseSignedCadToCents('1.234')).toBeNull();
    expect(parseSignedCadToCents('21474836.48')).toBeNull();
    expect(parseSignedCadToCents('-21474836.48')).toBeNull();
  });

  it('formats CAD cents without rounding away payable cents', () => {
    expect(formatCadCents(125050)).toBe('$1,250.50');
    expect(formatCadCents(120000)).toBe('$1,200.00');
  });

  it('formats signed CAD cents for change-order deltas', () => {
    expect(formatSignedCadCents(12550)).toBe('+$125.50');
    expect(formatSignedCadCents(-12550)).toBe('-$125.50');
    expect(formatSignedCadCents(0)).toBe('+$0.00');
  });

  it('keeps payment-facing milestone screens on exact cent formatting', () => {
    const homeownerMilestones = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/milestones.tsx'),
      'utf8',
    );
    const companyMilestones = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/milestones.tsx'),
      'utf8',
    );

    expect(homeownerMilestones).toContain("import { formatCadCents } from '@/lib/currency'");
    expect(homeownerMilestones).toContain('return formatCadCents(cents);');
    expect(companyMilestones).toContain("import { formatCadCents } from '@/lib/currency'");
    expect(companyMilestones).toContain('return formatCadCents(cents);');
  });

  it('uses strict signed currency parsing for company change orders', () => {
    const companyChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/change-orders.tsx'),
      'utf8',
    );
    const homeownerChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/change-orders.tsx'),
      'utf8',
    );

    expect(companyChangeOrders).toContain("import { formatSignedCadCents, parseSignedCadToCents } from '@/lib/currency'");
    expect(companyChangeOrders).toContain('const parsedDelta = parseSignedCadToCents(costDelta);');
    expect(companyChangeOrders).toContain('deltaCents = parsedDelta;');
    expect(companyChangeOrders).not.toContain("replace(/[^0-9.-]/g, '')");
    expect(homeownerChangeOrders).toContain("import { formatSignedCadCents } from '@/lib/currency'");
    expect(homeownerChangeOrders).toContain('formatSignedCadCents(co.cost_delta)');
  });
});
