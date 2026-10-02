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
    const jobDetail = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/index.tsx'),
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
    expect(license).not.toContain("navigation.navigate('InsuranceOnboarding')\n            style={styles.skipButton}");
    expect(license).not.toContain('Skip for now');
    expect(license).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Please try again.')");

    expect(insurance).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(insurance).toContain("Alert.alert('Could not submit verification', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(insurance).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Please try again.')");

    expect(jobDetail).toContain("formatSupabaseFunctionError(err, 'Failed to accept job.')");
    expect(jobDetail).toContain("Alert.alert('Try again', 'Another contractor is claiming this slot right now. Try again.')");
    expect(jobDetail).toContain("Alert.alert('Could not accept job', msg)");
    expect(jobDetail).not.toContain("Alert.alert('Error', err instanceof Error ? err.message");
    expect(jobDetail).not.toContain("Alert.alert('Error', msg)");
  });

  it('falls back to the active Supabase session on core company screens', () => {
    const jobFeed = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/index.tsx'),
      'utf8',
    );
    const calendar = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/calendar.tsx'),
      'utf8',
    );
    const earnings = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/earnings.tsx'),
      'utf8',
    );

    [jobFeed, calendar, earnings].forEach((source) => {
      expect(source).toContain("import { getCurrentUser");
      expect(source).toContain('user?.id ?? (await getCurrentUser())?.id ?? null');
      expect(source).not.toContain(".eq('user_id', user.id)");
      expect(source).toContain('}, [user?.id]);');
    });
    expect(jobFeed).toContain("setErrorMessage('You need to be signed in to view jobs.');");
    expect(jobFeed).toContain("if (!hasLoadedRef.current) {\n        setCompany(null);\n        setJobs([]);\n        setActiveJobs([]);\n      }\n      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load jobs.'))");
    expect(calendar).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load calendar.'))");
    expect(earnings).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load earnings.'))");
  });
});
