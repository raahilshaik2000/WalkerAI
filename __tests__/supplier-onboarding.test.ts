import { buildSupplierLicenseUpdatePayload } from '../src/lib/supplier-onboarding';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('supplier onboarding helpers', () => {
  it('only writes a supplier license document path when a new upload exists', () => {
    expect(buildSupplierLicenseUpdatePayload(' LIC-123 ', null)).toEqual({
      license_number: 'LIC-123',
    });

    expect(buildSupplierLicenseUpdatePayload(' LIC-123 ', 'supplier-licenses/user/license.jpg')).toEqual({
      license_number: 'LIC-123',
      license_doc_url: 'supplier-licenses/user/license.jpg',
    });
  });

  it('uses app-safe copy for supplier onboarding save failures', () => {
    const business = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/onboarding/business.tsx'), 'utf8');
    const license = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/onboarding/license.tsx'), 'utf8');
    const categories = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/onboarding/categories.tsx'), 'utf8');

    expect(business).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(business).toContain("Alert.alert('Could not save business info', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(business).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Try again.')");

    expect(license).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(license).toContain("Alert.alert('Could not save license', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(license).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Try again.')");

    expect(categories).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(categories).toContain("Alert.alert('Could not save categories', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(categories).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Try again.')");
  });

  it('clears the full auth session on supplier sign out', () => {
    const profile = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/profile/index.tsx'), 'utf8');

    expect(profile).toContain('const { user, clearSession } = useAuthStore();');
    expect(profile).toContain('await supabase.auth.signOut(); clearSession();');
    expect(profile).not.toContain('setSession(null)');
  });
});
