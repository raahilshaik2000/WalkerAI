declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

export {};

describe('change-order workflow copy', () => {
  it('does not imply signed cost deltas automatically change funded escrow', () => {
    const companyChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/change-orders.tsx'),
      'utf8',
    );
    const homeownerChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/change-orders.tsx'),
      'utf8',
    );

    expect(homeownerChangeOrders).not.toContain('This will adjust the project cost by');
    expect(homeownerChangeOrders).toContain('does not automatically update funded escrow or milestone payments');
    expect(homeownerChangeOrders).toContain('does not automatically change funded escrow or milestone payments');
    expect(homeownerChangeOrders).toContain('Documented cost change');
    expect(homeownerChangeOrders).toContain("import type { ChangeOrder } from '@/types/database.types'");
    expect(homeownerChangeOrders).toContain('id, project_id, company_id, description, cost_delta, status, signed_by_homeowner, signed_by_company, created_at');
    expect(companyChangeOrders).toContain('funded escrow and milestone payments are not updated automatically');
    expect(companyChangeOrders).toContain('Documented only; escrow is not adjusted automatically.');
    expect(companyChangeOrders).toContain("import type { ChangeOrder } from '@/types/database.types'");
    expect(companyChangeOrders).toContain('id, project_id, company_id, description, cost_delta, status, signed_by_homeowner, signed_by_company, created_at');
  });

  it('uses app-safe copy for homeowner and company change-order failures', () => {
    const companyChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/change-orders.tsx'),
      'utf8',
    );
    const homeownerChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/change-orders.tsx'),
      'utf8',
    );

    expect(homeownerChangeOrders).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(homeownerChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load change orders.'))");
    expect(homeownerChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load change orders.'))");
    expect(homeownerChangeOrders).toContain("} finally {\n      setLoading(false);");
    expect(homeownerChangeOrders).toContain("Alert.alert('Could not approve change order', formatAppSafeErrorMessage(error, 'Please try again.'))");
    expect(homeownerChangeOrders).toContain("Alert.alert('Could not approve change order', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(homeownerChangeOrders).toContain("Alert.alert('Could not reject change order', formatAppSafeErrorMessage(error, 'Please try again.'))");
    expect(homeownerChangeOrders).toContain("Alert.alert('Could not reject change order', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(homeownerChangeOrders).toContain("} finally {\n              setResponding(null);");
    expect(homeownerChangeOrders).toContain('variant="destructive"\n                        loading={isResponding}');
    expect(homeownerChangeOrders).not.toContain('setErrorMessage(`Could not load change orders: ${error.message}`)');
    expect(homeownerChangeOrders).not.toContain("Alert.alert('Error', error.message)");

    expect(companyChangeOrders).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(companyResult.error, 'Could not load company profile.'))");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(legacyResult.error, 'Could not load change orders.'))");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load change orders.'))");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load change orders.'))");
    expect(companyChangeOrders).toContain("Alert.alert('Could not submit change order', formatAppSafeErrorMessage(insertError, 'Please try again.'))");
    expect(companyChangeOrders).toContain("Alert.alert('Could not submit change order', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(companyChangeOrders).toContain("} finally {\n      setSubmitting(false);");
    expect(companyChangeOrders).toContain("Alert.alert('Could not sign change order', formatAppSafeErrorMessage(error, 'Please try again.'))");
    expect(companyChangeOrders).toContain("Alert.alert('Could not sign change order', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(companyChangeOrders).not.toContain('setErrorMessage(`Could not load company profile: ${companyResult.error.message}`)');
    expect(companyChangeOrders).not.toContain('setErrorMessage(`Could not load change orders: ${legacyResult.error.message}`)');
    expect(companyChangeOrders).not.toContain('setErrorMessage(`Could not load change orders: ${error.message}`)');
    expect(companyChangeOrders).not.toContain("Alert.alert('Error', insertError.message)");
    expect(companyChangeOrders).not.toContain("Alert.alert('Error', error.message)");
  });

  it('clears stale change-order state when approval context cannot load', () => {
    const companyChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/change-orders.tsx'),
      'utf8',
    );
    const homeownerChangeOrders = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/change-orders.tsx'),
      'utf8',
    );

    expect(homeownerChangeOrders).toContain('const clearChangeOrderState = useCallback(() => {');
    expect(homeownerChangeOrders).toContain('setChangeOrders([]);');
    expect(homeownerChangeOrders).toContain('setResponding(null);');
    expect(homeownerChangeOrders).toContain("setErrorMessage('Project is missing. Reopen change orders from the project page.');\n        clearChangeOrderState();");
    expect(homeownerChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load change orders.'));\n        clearChangeOrderState();");
    expect(homeownerChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load change orders.'));\n      clearChangeOrderState();");
    expect(homeownerChangeOrders).toContain('}, [clearChangeOrderState, projectId]);');

    expect(companyChangeOrders).toContain('const clearChangeOrderState = useCallback(() => {');
    expect(companyChangeOrders).toContain('setCompanyId(null);');
    expect(companyChangeOrders).toContain('setShowForm(false);');
    expect(companyChangeOrders).toContain("setDescription('');");
    expect(companyChangeOrders).toContain("setErrorMessage('Project is missing. Reopen change orders from the job page.');\n      clearChangeOrderState();");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(companyResult.error, 'Could not load company profile.'));\n        clearChangeOrderState();");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(legacyResult.error, 'Could not load change orders.'));\n            clearChangeOrderState();");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load change orders.'));\n        clearChangeOrderState();");
    expect(companyChangeOrders).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load change orders.'));\n      clearChangeOrderState();");
    expect(companyChangeOrders).toContain('}, [clearChangeOrderState, projectId, user?.id]);');
  });
});
