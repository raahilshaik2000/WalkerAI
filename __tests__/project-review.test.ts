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
    expect(source).toContain('setTargetError(loadError.message)');
    expect(source).toContain('Could not load contractors');
    expect(source).toContain("disabled={!!targetError || !selectedTarget || projectStatus !== 'completed'}");
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
});
