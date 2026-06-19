export {};

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('project review closeout screens', () => {
  it('surfaces homeowner review target load errors instead of showing an empty contractor state', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/review.tsx'),
      'utf8',
    );

    expect(source).toContain('const [targetError, setTargetError]');
    expect(source).toContain("isMissingSupabaseSchemaObjectError(gcRes.error, 'general_contractor_projects')");
    expect(source).toContain('const loadError = quotesRes.error ?? slotsRes.error ?? legacyRes.error ?? (gcContextUnavailable ? null : gcRes.error)');
    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions'");
    expect(source).toContain("setTargetError(formatAppSafeErrorMessage(loadError, 'Could not load contractor review targets.'))");
    expect(source).toContain('Could not load contractors');
    expect(source).toContain("disabled={!!targetError || !selectedTarget || projectStatus !== 'completed'}");
    expect(source).toContain("Alert.alert('Sign in required', 'Please sign in again before submitting a contractor review.')");
    expect(source).toContain(".eq('reviewer_id', user.id)");
    expect(source).toContain('reviewer_id: user.id');
    expect(source).toContain("throw new Error(formatAppSafeErrorMessage(existingError, 'Could not check existing reviews.'))");
    expect(source).toContain("Alert.alert('Could not submit review', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).not.toContain('setTargetError(loadError.message)');
    expect(source).not.toContain('existingError.message');
    expect(source).not.toContain('user!.id');
    expect(source).not.toContain("Alert.alert('Error', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).not.toContain("err instanceof Error ? err.message : 'Please try again.'");
  });

  it('lets homeowners review a GC manager after closeout without breaking company rating refresh', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/review.tsx'),
      'utf8',
    );
    const migration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260616038000_add_gc_project_reviews.sql'),
      'utf8',
    );

    expect(source).toContain("target_type: 'company' | 'general_contractor'");
    expect(source).toContain('function normalizeGeneralContractor');
    expect(source).toContain('function reviewTargetKey');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain("general_contractor:general_contractors(id, user_id, business_name)");
    expect(source).toContain("target_type: 'general_contractor'");
    expect(source).toContain('for (const assignment of gcContextUnavailable ? [] : gcRes.data ?? [])');
    expect(source).toContain("selectedTarget.target_type === 'company'");
    expect(source).toContain("p_company_id: selectedTarget.target_id");

    expect(migration).toContain('DROP POLICY IF EXISTS "reviews_homeowner_insert_project_contractor"');
    expect(migration).toContain('CREATE POLICY "reviews_homeowner_insert_project_contractor"');
    expect(migration).toContain("p.status = 'completed'");
    expect(migration).toContain('FROM public.general_contractor_projects gcp');
    expect(migration).toContain('JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id');
    expect(migration).toContain("gcp.status IN ('active', 'completed')");
    expect(migration).toContain('gc.user_id = reviews.reviewee_id');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.update_company_rating()');
    expect(migration).toContain('v_gc_id UUID');
    expect(migration).toContain("set_config('walker.internal_gc_rating_update', 'review_rating', true)");
    expect(migration).toContain('UPDATE public.general_contractors');
  });

  it('shows GC review recipients in homeowner review history', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/my-reviews.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions'");
    expect(source).toContain("const contractorsByUserId = new Map<string, { name: string; roleLabel: string }>();");
    expect(source).toContain(".from('companies')");
    expect(source).toContain(".from('general_contractors')");
    expect(source).toContain(".select('user_id, business_name')");
    expect(source).toContain("roleLabel: 'Trade contractor'");
    expect(source).toContain("roleLabel: 'General contractor'");
    expect(source).toContain('contractor: contractorsByUserId.get(r.reviewee_id) ?? null');
    expect(source).toContain("formatAppSafeErrorMessage(error, 'Could not load reviews.')");
    expect(source).toContain("formatAppSafeErrorMessage(gcError, 'Could not load review recipients.')");
    expect(source).not.toContain('setErrorMessage(error.message)');
    expect(source).not.toContain('setErrorMessage(companiesError.message)');
  });

  it('uses app-safe copy for company homeowner review failures', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/review.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(source).toContain("Alert.alert('Could not load review', formatAppSafeErrorMessage(projectResult.error, 'Please try again.'))");
    expect(source).toContain("Alert.alert('Could not load review', formatAppSafeErrorMessage(existingResult.error, 'Please try again.'))");
    expect(source).toContain("Alert.alert('Could not submit review', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(source).not.toContain("Alert.alert('Error', projectResult.error.message)");
    expect(source).not.toContain("Alert.alert('Error', existingResult.error.message)");
    expect(source).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit review.')");
  });
});
