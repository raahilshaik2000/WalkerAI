export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('company profile services display', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/(company)/profile.tsx'), 'utf8');

  it('does not present the separate GC role as a company service', () => {
    expect(source).not.toContain('Legacy general contractor');
    expect(source).toContain("filter((trade) => trade !== 'general_contractor')");
  });

  it('does not invent a plumber service when company trade data is missing', () => {
    expect(source).not.toContain("company.trade_types?.length ? company.trade_types : ['plumber']");
    expect(source).toContain('Services not selected');
  });

  it('uses app-safe copy for company profile load failures', () => {
    expect(source).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(companyError, 'Could not load company profile.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(legacyProjectsError, 'Could not load company projects.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(slotProjectsError, 'Could not load company projects.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(milestonesError, 'Could not load company earnings.'))");
    expect(source).not.toContain("setErrorMessage(companyError instanceof Error ? companyError.message : 'Could not load company profile.')");
    expect(source).not.toContain('setErrorMessage(legacyProjectsError.message)');
    expect(source).not.toContain('setErrorMessage(slotProjectsError.message)');
    expect(source).not.toContain('setErrorMessage(milestonesError.message)');
  });
});
