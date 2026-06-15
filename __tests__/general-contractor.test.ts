import {
  isGeneralContractorSetupComplete,
  nextGeneralContractorOnboardingRoute,
} from '../src/lib/general-contractor';
import { resolveNotificationRoute } from '../src/lib/notifications/navigation';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');
const repoRoot = path.join(__dirname, '..');

describe('general contractor account type', () => {
  it('routes general contractor notifications into the GC navigator', () => {
    expect(resolveNotificationRoute('new_message', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorProjectDetail',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('new_message', {}, 'general_contractor')).toEqual({
      name: 'GeneralContractorTabs',
      params: { screen: 'GeneralContractorProjects' },
    });
  });

  it('keeps GC onboarding separate from company onboarding', () => {
    expect(nextGeneralContractorOnboardingRoute(null)).toBe('GeneralContractorBusinessOnboarding');
    expect(nextGeneralContractorOnboardingRoute({ license_number: null, insurance_doc_url: null })).toBe('GeneralContractorLicenseOnboarding');
    expect(nextGeneralContractorOnboardingRoute({ license_number: 'GC-123', insurance_doc_url: null })).toBe('GeneralContractorInsuranceOnboarding');
    expect(isGeneralContractorSetupComplete({ license_number: 'GC-123', insurance_doc_url: 'https://example.com/insurance.pdf' })).toBe(true);
  });

  it('adds the GC role to registration and root routing without falling through to company', () => {
    const register = fs.readFileSync(path.join(repoRoot, 'src/app/(auth)/register.tsx'), 'utf8');
    const rootNavigator = fs.readFileSync(path.join(repoRoot, 'src/navigation/RootNavigator.tsx'), 'utf8');

    expect(register).toContain("value: 'general_contractor'");
    expect(rootNavigator).toContain("role === 'general_contractor'");
    expect(rootNavigator).toContain("resolvedRole === 'general_contractor'");
    expect(rootNavigator).toContain('component={GeneralContractorNavigator}');
  });

  it('adds a database constraint and tables for GC profiles and assignments', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000100_add_general_contractor_role.sql'),
      'utf8',
    );

    expect(migration).toContain("'general_contractor'");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.general_contractors');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.general_contractor_projects');
    expect(migration).toContain('homeowner_id = (SELECT auth.uid())');
  });

  it('adds homeowner project concierge entry and verified GC browsing policy', () => {
    const projectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/index.tsx'),
      'utf8',
    );
    const rootNavigator = fs.readFileSync(path.join(repoRoot, 'src/navigation/RootNavigator.tsx'), 'utf8');
    const policyMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000200_allow_homeowners_to_view_verified_gcs.sql'),
      'utf8',
    );

    expect(projectDetail).toContain("label: 'Concierge'");
    expect(projectDetail).toContain("screen: 'Concierge'");
    expect(rootNavigator).toContain("name=\"Concierge\"");
    expect(policyMigration).toContain('verified = TRUE');
    expect(policyMigration).toContain('general_contractors_select_own_or_verified');
  });

  it('lets invited GCs activate their project management assignment', () => {
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(gcProjectDetail).toContain('Accept Management Invite');
    expect(gcProjectDetail).toContain("update({ status: 'active' })");
    expect(gcProjectDetail).toContain('GC management terms');
  });

  it('adds generic homeowner approval requests for GC recommendations', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000300_add_project_approval_requests.sql'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.project_approval_requests');
    expect(migration).toContain('approval_requests_gc_insert');
    expect(migration).toContain('approval_requests_homeowner_update');
    expect(gcProjectDetail).toContain('Send for Homeowner Approval');
    expect(gcProjectDetail).toContain("from('project_approval_requests').insert");
    expect(homeownerConcierge).toContain("from('project_approval_requests')");
    expect(homeownerConcierge).toContain("handleApprovalResponse(request, 'approved')");
    expect(homeownerConcierge).toContain("handleApprovalResponse(request, 'rejected')");
  });

  it('supports GC-initiated homeowner-owned draft projects with homeowner confirmation', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000400_add_gc_project_creation_rpc.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const dashboard = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/index.tsx'),
      'utf8',
    );
    const createProject = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/create.tsx'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_gc_managed_project');
    expect(migration).toContain("role = 'homeowner'");
    expect(migration).toContain("v_gc.verified IS NOT TRUE");
    expect(migration).toContain('initiated_by_gc');
    expect(migration).toContain("'draft'");
    expect(navigator).toContain('GeneralContractorCreateProject');
    expect(dashboard).toContain("navigation.navigate('GeneralContractorCreateProject')");
    expect(createProject).toContain("supabase.rpc('create_gc_managed_project'");
    expect(homeownerConcierge).toContain('Confirm GC Management');
    expect(gcProjectDetail).toContain('Waiting for the homeowner to confirm GC management');
  });

  it('surfaces the GC markup engine on managed project detail', () => {
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(gcProjectDetail).toContain("import { calculateGcMarkup } from '@/lib/gc-markup'");
    expect(gcProjectDetail).toContain('Markup engine');
    expect(gcProjectDetail).toContain('Homeowner-facing total');
    expect(gcProjectDetail).toContain('Estimated GC revenue');
  });
});
