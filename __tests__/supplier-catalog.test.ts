import {
  nextCatalogSetupRoute,
  parseNonNegativeDays,
  parsePositiveCadToCents,
  selectedSupplierCategories,
} from '../src/lib/supplier-catalog';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('supplier catalog helpers', () => {
  it('filters supplier categories to supported material categories', () => {
    expect(selectedSupplierCategories(['Cabinets & Storage', 'Unknown', 42, 'Other'])).toEqual([
      'Cabinets & Storage',
      'Other',
    ]);
  });

  it('routes incomplete supplier setup to the next catalog prerequisite', () => {
    expect(nextCatalogSetupRoute(null)).toBe('SupplierBusinessOnboarding');
    expect(nextCatalogSetupRoute({ license_number: null, categories: ['Other'] })).toBe('SupplierLicenseOnboarding');
    expect(nextCatalogSetupRoute({ license_number: 'LIC-1', categories: [] })).toBe('SupplierCategoriesOnboarding');
    expect(nextCatalogSetupRoute({ license_number: 'LIC-1', categories: ['Other'] })).toBeNull();
  });

  it('parses valid catalog price and lead-time inputs', () => {
    expect(parsePositiveCadToCents('12.34')).toBe(1234);
    expect(parsePositiveCadToCents('12,34')).toBe(1234);
    expect(parsePositiveCadToCents('12·34')).toBe(1234);
    expect(parsePositiveCadToCents(' 1 ')).toBe(100);
    expect(parseNonNegativeDays('0')).toBe(0);
    expect(parseNonNegativeDays('14')).toBe(14);
  });

  it('rejects malformed or database-unsafe catalog numbers', () => {
    expect(parsePositiveCadToCents('0')).toBeNull();
    expect(parsePositiveCadToCents('-1')).toBeNull();
    expect(parsePositiveCadToCents('1.234')).toBeNull();
    expect(parsePositiveCadToCents('1,2,3')).toBeNull();
    expect(parsePositiveCadToCents('21474836.48')).toBeNull();
    expect(parseNonNegativeDays('-1')).toBeNull();
    expect(parseNonNegativeDays('1.5')).toBeNull();
  });

  it('uses app-safe copy for supplier catalog, earnings, and profile failures', () => {
    const catalog = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/catalog/index.tsx'), 'utf8');
    const addCatalog = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/catalog/add.tsx'), 'utf8');
    const editCatalog = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/catalog/[id]/index.tsx'), 'utf8');
    const earnings = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/earnings/index.tsx'), 'utf8');
    const profile = fs.readFileSync(path.join(__dirname, '../src/app/(supplier)/profile/index.tsx'), 'utf8');
    const supplierData = fs.readFileSync(path.join(__dirname, '../src/lib/supplier-data.ts'), 'utf8');

    expect(catalog).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(catalog).toContain("import { supplierQueryKeys, useSupplierCatalog } from '@/lib/supplier-data';");
    expect(catalog).toContain('useSupplierCatalog(user?.id)');
    expect(catalog).toContain("formatAppSafeErrorMessage(profileQuery.error, 'Could not load catalog.')");
    expect(catalog).toContain("formatAppSafeErrorMessage(catalogQuery.error, 'Could not load catalog.')");
    expect(supplierData).toContain('export async function fetchSupplierCatalog(supplierId: string)');
    expect(supplierData).toContain(".eq('supplier_id', supplierId)");
    expect(supplierData).toContain('if (error) throw error;');
    expect(catalog).toContain("Alert.alert('Could not update stock', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(catalog).toContain('queryClient.setQueryData(');
    expect(catalog).not.toContain(".eq('user_id', user.id)");
    expect(catalog).not.toContain('setErrorMessage(supplierError.message)');
    expect(catalog).not.toContain('setErrorMessage(error.message)');
    expect(catalog).not.toContain("Alert.alert('Could not update stock', error.message)");

    expect(addCatalog).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(addCatalog).toContain("import { getCurrentUser } from '@/lib/supabase/auth';");
    expect(addCatalog).toContain('const currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;');
    expect(addCatalog).toContain('currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;');
    expect(addCatalog).toContain(".eq('user_id', currentUserId)");
    expect(addCatalog).toContain("Alert.alert('Could not load supplier profile', formatAppSafeErrorMessage(error, 'Please try again.'))");
    expect(addCatalog).toContain("Alert.alert('Could not load supplier profile', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(addCatalog).toContain("Alert.alert('Sign in required', formatAppSafeErrorMessage(err, 'Please sign in again before adding catalog items.'))");
    expect(addCatalog).toContain("Alert.alert('Could not save catalog item', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(addCatalog).not.toContain(".eq('user_id', user.id)");
    expect(addCatalog).not.toContain("Alert.alert('Could not load supplier profile', error.message)");
    expect(addCatalog).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save.')");

    expect(editCatalog).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(editCatalog).toContain("import { getCurrentUser } from '@/lib/supabase/auth';");
    expect(editCatalog).toContain('const currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;');
    expect(editCatalog).toContain(".eq('user_id', currentUserId)");
    expect(editCatalog).toContain("Alert.alert('Could not load supplier profile', formatAppSafeErrorMessage(supplierResult.error, 'Please try again.'))");
    expect(editCatalog).toContain("Alert.alert('Could not load catalog item', formatAppSafeErrorMessage(error, 'Please try again.'))");
    expect(editCatalog).toContain("Alert.alert('Could not load catalog item', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(editCatalog).toContain("Alert.alert('Could not save catalog item', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(editCatalog).toContain("Alert.alert('Could not delete catalog item', formatAppSafeErrorMessage(error, 'Please try again.'))");
    expect(editCatalog).not.toContain(".eq('user_id', user.id)");
    expect(editCatalog).not.toContain("Alert.alert('Error', supplierResult.error.message)");
    expect(editCatalog).not.toContain("Alert.alert('Error', error?.message ?? 'Could not load item.')");
    expect(editCatalog).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save.')");
    expect(editCatalog).not.toContain("Alert.alert('Error', error.message)");

    expect(earnings).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';");
    expect(earnings).toContain("import { refreshStripeConnectStatus } from '@/lib/stripe-connect';");
    expect(earnings).toContain("await refreshStripeConnectStatus('supplier');");
    expect(earnings).toContain('useSupplierEarnings(user?.id)');
    expect(earnings).toContain("formatAppSafeErrorMessage(profileQuery.error, 'Could not load earnings.')");
    expect(earnings).toContain("formatAppSafeErrorMessage(earningsQuery.error, 'Could not load earnings.')");
    expect(earnings).toContain("Alert.alert('Could not start payout setup', error ? await formatSupabaseFunctionError(error, 'Please try again.') : 'Please try again.')");
    expect(earnings).not.toContain('setErrorMessage(supplierError.message)');
    expect(earnings).not.toContain('setErrorMessage(error.message)');

    expect(profile).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(profile).toContain("formatAppSafeErrorMessage(error, 'Could not load supplier profile.')");
    expect(profile).not.toContain('setErrorMessage(error.message)');
  });
});
