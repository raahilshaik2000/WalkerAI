export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('company entry and onboarding errors', () => {
  it('uses app-safe copy for job feed and onboarding failures', () => {
    const jobFeed = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/index.tsx'),
      'utf8',
    );
    const business = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/onboarding/business.tsx'),
      'utf8',
    );
    const license = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/onboarding/license.tsx'),
      'utf8',
    );
    const insurance = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/onboarding/insurance.tsx'),
      'utf8',
    );

    expect(jobFeed).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(jobFeed).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load jobs.'))");
    expect(jobFeed).not.toContain("setErrorMessage(err instanceof Error ? err.message : 'Could not load jobs.')");

    expect(business).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(business).toContain("Alert.alert('Could not save business info', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(business).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Please try again.')");

    expect(license).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(license).toContain("Alert.alert('Could not save license', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(license).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Please try again.')");

    expect(insurance).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(insurance).toContain("Alert.alert('Could not submit verification', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(insurance).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Please try again.')");
  });
});
