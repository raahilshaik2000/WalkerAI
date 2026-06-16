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
    const businessOnboarding = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/onboarding/business.tsx'),
      'utf8',
    );

    expect(nextGeneralContractorOnboardingRoute(null)).toBe('GeneralContractorBusinessOnboarding');
    expect(nextGeneralContractorOnboardingRoute({ license_number: null, license_doc_url: null, insurance_doc_url: null })).toBe('GeneralContractorLicenseOnboarding');
    expect(nextGeneralContractorOnboardingRoute({ license_number: 'GC-123', license_doc_url: null, insurance_doc_url: null })).toBe('GeneralContractorLicenseOnboarding');
    expect(nextGeneralContractorOnboardingRoute({ license_number: 'GC-123', license_doc_url: 'qa/gc-license.pdf', insurance_doc_url: null })).toBe('GeneralContractorInsuranceOnboarding');
    expect(isGeneralContractorSetupComplete({ license_number: 'GC-123', license_doc_url: 'qa/gc-license.pdf', insurance_doc_url: 'https://example.com/insurance.pdf' })).toBe(true);
    expect(businessOnboarding).toContain("from('general_contractors')");
    expect(businessOnboarding).toContain('business_name, address, city, province, postal_code, service_radius_km');
    expect(businessOnboarding).toContain('setBusinessName(data.business_name');
    expect(businessOnboarding).toContain('setDefaultMarkup(data.default_markup_pct');
    expect(businessOnboarding).toContain('setConciergeEnabled(data.concierge_enabled === true)');
    expect(businessOnboarding).toContain('existing?.id');
    expect(businessOnboarding).toContain('returnToProfile');
    expect(businessOnboarding).toContain('Concierge marketplace');
    expect(businessOnboarding).toContain('concierge_enabled: conciergeEnabled');
    expect(businessOnboarding).not.toContain('concierge_enabled: true');
    expect(businessOnboarding).toContain("navigation.navigate('GeneralContractorTabs', { screen: 'GeneralContractorProfile' })");
  });

  it('keeps the GC account role out of company trade onboarding defaults', () => {
    const companyBusinessOnboarding = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/onboarding/business.tsx'),
      'utf8',
    );
    const companyProfile = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/profile.tsx'),
      'utf8',
    );
    const gcRoleMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000100_add_general_contractor_role.sql'),
      'utf8',
    );

    expect(companyBusinessOnboarding).not.toContain("value: 'general_contractor'");
    expect(companyBusinessOnboarding).toContain("useState<TradeType[]>(['plumber'])");
    expect(companyProfile).toContain("general_contractor: 'Legacy general contractor'");
    expect(companyProfile).toContain("company.trade_types?.length ? company.trade_types : ['plumber']");
    expect(gcRoleMigration).toContain('Existing company rows may still list "general_contractor" as a legacy trade.');
    expect(gcRoleMigration).toContain('New GC users use this separate concierge/GC role and profile table.');
  });

  it('preloads existing GC document setup fields when onboarding is resumed', () => {
    const licenseOnboarding = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/onboarding/license.tsx'),
      'utf8',
    );
    const insuranceOnboarding = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/onboarding/insurance.tsx'),
      'utf8',
    );

    expect(licenseOnboarding).toContain("select('license_number, license_doc_url')");
    expect(licenseOnboarding).toContain("setLicenseNumber(data.license_number ?? '')");
    expect(licenseOnboarding).toContain("setDocumentUrl(data.license_doc_url ?? '')");
    expect(licenseOnboarding).toContain("launchImageLibrary");
    expect(licenseOnboarding).toContain("uploadFile('company-docs'");
    expect(licenseOnboarding).toContain('general-contractors/${user.id}/license-');
    expect(licenseOnboarding).toContain('License document required');
    expect(licenseOnboarding).toContain('License Document URL');
    expect(insuranceOnboarding).toContain("select('insurance_doc_url')");
    expect(insuranceOnboarding).toContain("setDocumentUrl(data.insurance_doc_url ?? '')");
    expect(insuranceOnboarding).toContain("launchImageLibrary");
    expect(insuranceOnboarding).toContain("uploadFile('company-docs'");
    expect(insuranceOnboarding).toContain('general-contractors/${user.id}/insurance-');
    expect(licenseOnboarding).not.toContain('until native upload is wired');
    expect(insuranceOnboarding).not.toContain('until native upload is wired');
  });

  it('scopes shared document storage paths to the matching account type', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616010242_scope_company_docs_by_account_type.sql'),
      'utf8',
    );
    const privateHelperMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616010729_move_company_docs_helper_private.sql'),
      'utf8',
    );
    const companyLicense = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/onboarding/license.tsx'),
      'utf8',
    );
    const supplierLicense = fs.readFileSync(
      path.join(repoRoot, 'src/app/(supplier)/onboarding/license.tsx'),
      'utf8',
    );
    const gcLicense = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/onboarding/license.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.can_access_company_doc_path');
    expect(migration).toContain("current_user_role.role = 'company'");
    expect(migration).toContain('path.segment_1 = (SELECT auth.uid())::text');
    expect(migration).toContain("current_user_role.role = 'supplier'");
    expect(migration).toContain("path.segment_1 = 'supplier-licenses'");
    expect(migration).toContain("current_user_role.role = 'general_contractor'");
    expect(migration).toContain("path.segment_1 = 'general-contractors'");
    expect(migration).toContain("path.segment_1 = 'external-trades'");
    expect(migration).toContain('gc.verified IS TRUE');
    expect(migration).toContain("gcp.status = 'active'");
    expect(migration).toContain('public.can_access_company_doc_path(name)');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.can_access_company_doc_path(TEXT) TO authenticated');
    expect(privateHelperMigration).toContain('CREATE SCHEMA IF NOT EXISTS private');
    expect(privateHelperMigration).toContain('CREATE OR REPLACE FUNCTION private.can_access_company_doc_path');
    expect(privateHelperMigration).toContain('SECURITY DEFINER');
    expect(privateHelperMigration).toContain('private.can_access_company_doc_path(name)');
    expect(privateHelperMigration).toContain('GRANT USAGE ON SCHEMA private TO authenticated');
    expect(privateHelperMigration).toContain('GRANT EXECUTE ON FUNCTION private.can_access_company_doc_path(TEXT) TO authenticated');
    expect(privateHelperMigration).toContain('DROP FUNCTION IF EXISTS public.can_access_company_doc_path(TEXT)');
    expect(companyLicense).toContain('const path = `${user.id}/license-${Date.now()}.${upload.extension}`');
    expect(supplierLicense).toContain('supplier-licenses/${user.id}/license');
    expect(gcLicense).toContain('general-contractors/${user.id}/license-');
    expect(gcProjectDetail).toContain('external-trades/${currentUser.id}/${projectId}');
  });

  it('adds the GC role to registration and root routing without falling through to company', () => {
    const register = fs.readFileSync(path.join(repoRoot, 'src/app/(auth)/register.tsx'), 'utf8');
    const rootNavigator = fs.readFileSync(path.join(repoRoot, 'src/navigation/RootNavigator.tsx'), 'utf8');
    const authStore = fs.readFileSync(path.join(repoRoot, 'src/stores/auth.store.ts'), 'utf8');

    expect(register).toContain("value: 'general_contractor'");
    expect(register).toContain("label: 'General Contractor'");
    expect(register).toContain("label: 'Trade Company'");
    expect(rootNavigator).toContain("role === 'general_contractor'");
    expect(rootNavigator).toContain("resolvedRole === 'general_contractor'");
    expect(rootNavigator).toContain('component={GeneralContractorNavigator}');
    expect(rootNavigator).toContain('isMissingUserProfileColumn');
    expect(rootNavigator).toContain('schema cache');
    expect(rootNavigator).toContain('authRoleResolved');
    expect(rootNavigator).toContain('if (!hydrated || !authRoleResolved) return null;');
    expect(rootNavigator).toContain("setRole((data?.role as UserRole | undefined) ?? null)");
    expect(rootNavigator).not.toContain('metadataRole');
    expect(authStore).not.toContain('user_metadata?.role');
    expect(authStore).not.toContain('role: state.role');
  });

  it('adds a database constraint and tables for GC profiles and assignments', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000100_add_general_contractor_role.sql'),
      'utf8',
    );
    const locationMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002400_sync_gc_location.sql'),
      'utf8',
    );

    expect(migration).toContain("'general_contractor'");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.general_contractors');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.general_contractor_projects');
    expect(migration).toContain('homeowner_id = (SELECT auth.uid())');
    expect(locationMigration).toContain('CREATE OR REPLACE FUNCTION public.sync_general_contractor_location');
    expect(locationMigration).toContain('ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography');
    expect(locationMigration).toContain('CREATE TRIGGER trg_general_contractors_location');
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
    const authenticatedPolicyMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616005756_restrict_verified_gc_browsing_to_auth.sql'),
      'utf8',
    );
    const discoveryMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002500_general_contractors_for_project.sql'),
      'utf8',
    );
    const discoveryExecuteMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616010006_restrict_gc_discovery_rpc_execute.sql'),
      'utf8',
    );
    const conciergeScreen = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );
    const inviteMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616004913_invite_gc_to_project_rpc.sql'),
      'utf8',
    );

    expect(projectDetail).toContain("label: 'Concierge'");
    expect(projectDetail).toContain("screen: 'Concierge'");
    expect(rootNavigator).toContain("name=\"Concierge\"");
    expect(policyMigration).toContain('verified = TRUE');
    expect(policyMigration).toContain('general_contractors_select_own_or_verified');
    expect(authenticatedPolicyMigration).toContain('DROP POLICY IF EXISTS "general_contractors_select_own_or_verified"');
    expect(authenticatedPolicyMigration).toContain('FOR SELECT TO authenticated');
    expect(authenticatedPolicyMigration).toContain('OR verified = TRUE');
    expect(authenticatedPolicyMigration).toContain('REVOKE SELECT ON public.general_contractors FROM anon');
    expect(authenticatedPolicyMigration).toContain('GRANT SELECT ON public.general_contractors TO authenticated');
    expect(discoveryMigration).toContain('CREATE OR REPLACE FUNCTION public.general_contractors_for_project');
    expect(discoveryMigration).toContain('p.homeowner_id = (SELECT auth.uid())');
    expect(discoveryMigration).toContain('ST_DWithin(gc.location, target_project.project_geography, gc.service_radius_km * 1000)');
    expect(discoveryMigration).toContain('distance_km');
    expect(discoveryExecuteMigration).toContain('REVOKE ALL ON FUNCTION public.general_contractors_for_project(UUID) FROM PUBLIC, anon');
    expect(discoveryExecuteMigration).toContain('GRANT EXECUTE ON FUNCTION public.general_contractors_for_project(UUID) TO authenticated');
    expect(conciergeScreen).toContain("supabase.rpc('general_contractors_for_project'");
    expect(conciergeScreen).toContain('fetchDiscoverableGeneralContractors(projectId)');
    expect(conciergeScreen).toContain('formatGcDistance(gc)');
    expect(conciergeScreen).toContain("supabase.rpc('invite_gc_to_project'");
    expect(conciergeScreen).toContain('p_project_id: projectId');
    expect(conciergeScreen).toContain('p_general_contractor_id: gc.id');
    expect(conciergeScreen).not.toContain("from('general_contractor_projects').insert");
    expect(inviteMigration).toContain('DROP POLICY IF EXISTS "gc_projects_homeowner_insert"');
    expect(inviteMigration).toContain('CREATE OR REPLACE FUNCTION public.invite_gc_to_project');
    expect(inviteMigration).toContain('homeowner_id = (SELECT auth.uid())');
    expect(inviteMigration).toContain('FOR UPDATE');
    expect(inviteMigration).toContain('verified IS TRUE');
    expect(inviteMigration).toContain('v_gc.default_markup_pct');
    expect(inviteMigration).toContain('v_gc.default_concierge_fee_pct');
    expect(inviteMigration).toContain('GRANT EXECUTE ON FUNCTION public.invite_gc_to_project(UUID, UUID) TO authenticated');
  });

  it('lets invited GCs activate their project management assignment', () => {
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const activationMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003000_secure_gc_assignment_activation.sql'),
      'utf8',
    );

    expect(gcProjectDetail).toContain('Accept Management Invite');
    expect(gcProjectDetail).toContain("supabase.rpc('accept_gc_management_invite'");
    expect(gcProjectDetail).toContain('p_assignment_id: assignment.id');
    expect(gcProjectDetail).not.toContain("update({ status: 'active' })");
    expect(gcProjectDetail).toContain('GC management terms');
    expect(gcProjectDetail).toContain("const assignmentIsActive = assignment?.status === 'active' && gcVerified");
    expect(gcProjectDetail).toContain('Controls unlock after homeowner confirmation');
    expect(gcProjectDetail).toContain('Schedule, permit, payment, material, trade, discovery, assistant, and completion tools become available once GC management is active.');
    expect(gcProjectDetail).toContain('Coordinate with the homeowner while management approval is pending');
    expect(activationMigration).toContain('DROP POLICY IF EXISTS "gc_projects_participant_update"');
    expect(activationMigration).toContain('CREATE POLICY "gc_projects_homeowner_update"');
    expect(activationMigration).toContain('CREATE OR REPLACE FUNCTION public.accept_gc_management_invite');
    expect(activationMigration).toContain('v_assignment.initiated_by_gc IS TRUE');
    expect(activationMigration).toContain('Homeowner confirmation is required for GC-created projects');
    expect(activationMigration).toContain("v_assignment.status <> 'invited'");
    expect(activationMigration).toContain("SET status = 'active'");
  });

  it('re-checks GC verification before management assignments activate', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615004100_require_verified_gc_assignment_activation.sql'),
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

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.accept_gc_management_invite');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.confirm_gc_management_assignment');
    expect(migration).toContain('v_gc_verified BOOLEAN');
    expect(migration).toContain('SELECT verified');
    expect(migration).toContain('v_assignment.general_contractor_id');
    expect(migration).toContain('v_gc_verified IS NOT TRUE');
    expect(migration).toContain('Only verified General Contractors can activate management assignments');
    expect(migration).toContain("SET status = 'active'");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.accept_gc_management_invite(UUID) TO authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.confirm_gc_management_assignment(UUID) TO authenticated');
    expect(gcProjectDetail).toContain(".select('id, verified')");
    expect(gcProjectDetail).toContain('setGcVerified(gc.verified === true)');
    expect(gcProjectDetail).toContain("if (!gcVerified) {\n      Alert.alert(\n        'Verification required'");
    expect(gcProjectDetail).toContain('WalkerAI verification is required before you can accept this management invite.');
    expect(gcProjectDetail).toContain('WalkerAI verification is required before project controls are available.');
    expect(gcProjectDetail).toContain("assignment.status === 'invited' && !assignment.initiated_by_gc && gcVerified");
    expect(homeownerConcierge).toContain("assignedGc?.verified === true");
    expect(homeownerConcierge).toContain('canConfirmGcManagement');
    expect(homeownerConcierge).toContain('WalkerAI verification is required before this GC management request can be confirmed.');
    expect(homeownerConcierge).toContain('disabled={!canConfirmGcManagement}');
  });

  it('requires current GC verification for project-control request inserts', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615232614_require_verified_gc_request_inserts.sql'),
      'utf8',
    );

    expect(migration).toContain('DROP POLICY IF EXISTS "approval_requests_gc_insert"');
    expect(migration).toContain('CREATE POLICY "approval_requests_gc_insert"');
    expect(migration).toContain('DROP POLICY IF EXISTS "gc_payment_requests_gc_insert"');
    expect(migration).toContain('CREATE POLICY "gc_payment_requests_gc_insert"');
    expect(migration).toContain('DROP POLICY IF EXISTS "gc_trade_negotiations_gc_insert"');
    expect(migration).toContain('CREATE POLICY "gc_trade_negotiations_gc_insert"');
    expect(migration).toMatch(/project_approval_requests[\s\S]*gc\.verified IS TRUE/);
    expect(migration).toMatch(/gc_payment_requests[\s\S]*gc\.verified IS TRUE/);
    expect(migration).toMatch(/gc_trade_quote_negotiations[\s\S]*gc\.verified IS TRUE/);
    expect(migration).toContain("gcp.status = 'active'");
    expect(migration).toContain("q.status = 'pending'");
  });

  it('locks GC project sub-screen controls when active assignments lose verification', () => {
    const screenPaths = [
      'src/app/(general-contractor)/project/[id]/schedule.tsx',
      'src/app/(general-contractor)/project/[id]/materials.tsx',
      'src/app/(general-contractor)/project/[id]/discovery.tsx',
      'src/app/(general-contractor)/project/[id]/payments.tsx',
      'src/app/(general-contractor)/project/[id]/permits.tsx',
      'src/app/(general-contractor)/project/[id]/trades.tsx',
      'src/app/(general-contractor)/project/[id]/completion.tsx',
    ];

    for (const screenPath of screenPaths) {
      const source = fs.readFileSync(path.join(repoRoot, screenPath), 'utf8');
      expect(source).toContain(".select('id, verified')");
      expect(source).toContain('setGcVerified(gc.verified === true)');
      expect(source).toContain('WalkerAI verification is required');
    }

    const assistant = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/assistant.tsx'),
      'utf8',
    );
    const projectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(assistant).toContain(".select('id, verified')");
    expect(assistant).toContain('gc.verified !== true');
    expect(assistant).toContain('WalkerAI verification is required before project assistant summaries are available.');
    expect(projectDetail).toContain("if (gc.verified !== true) throw new Error('WalkerAI must verify your GC profile before approval requests can be sent.')");
    expect(projectDetail).toContain("const assignmentIsActive = assignment?.status === 'active' && gcVerified");
    expect(projectDetail).toContain('{assignmentIsActive ? (');
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
    expect(gcProjectDetail).toContain("request_type: 'general_recommendation'");
    expect(gcProjectDetail).toContain('Use this only for general recommendations that do not need schedule, trade, material, discovery, payment, or completion metadata.');
    expect(gcProjectDetail).toContain('Use the dedicated project-control screens for workflow changes so homeowner approval has the required data to apply cleanly.');
    expect(gcProjectDetail).not.toContain('const APPROVAL_TYPES');
    expect(gcProjectDetail).not.toContain('setApprovalType');
    expect(gcProjectDetail).not.toContain('request_type: approvalType');
    expect(homeownerConcierge).toContain("from('project_approval_requests')");
    expect(homeownerConcierge).toContain("handleApprovalResponse(request, 'approved')");
    expect(homeownerConcierge).toContain("handleApprovalResponse(request, 'rejected')");
  });

  it('shows action-aware homeowner approval details for GC-managed changes', () => {
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(homeownerConcierge).toContain('metadata: Record<string, unknown> | null');
    expect(homeownerConcierge).toContain('getApprovalDetailRows(request)');
    expect(homeownerConcierge).toContain("action === 'update_gc_budget'");
    expect(homeownerConcierge).toContain('New project estimate:');
    expect(homeownerConcierge).toContain("action === 'update_gc_terms'");
    expect(homeownerConcierge).toContain('Approving updates the GC markup and concierge fee');
    expect(homeownerConcierge).toContain('Review GC recommendations before they change project budget, terms, materials, trades, schedule, or completion status.');
    expect(homeownerConcierge).not.toContain('Any project updates still need to be applied by the appropriate workflow.');
  });

  it('requires active verified GC management before approved recommendations apply project changes', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003400_require_active_gc_for_approval_apply.sql'),
      'utf8',
    );
    const verificationMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616000625_require_verified_gc_approval_apply.sql'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_approval_apply_active_assignment()');
    expect(migration).toContain("NEW.status = 'approved'");
    expect(migration).toContain("OLD.status = 'pending'");
    expect(migration).toContain("NEW.request_type IN ('schedule_change', 'material_substitution', 'trade_substitution')");
    expect(migration).toContain("NEW.metadata->>'action' IN ('update_gc_budget', 'update_gc_terms', 'complete_project')");
    expect(migration).toContain('FROM public.general_contractor_projects gcp');
    expect(migration).toContain("gcp.status = 'active'");
    expect(migration).toContain('Active GC management is required before this approval can apply project changes');
    expect(migration).toContain('guard_gc_approval_apply_active_assignment_trigger');
    expect(verificationMigration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_approval_apply_active_assignment()');
    expect(verificationMigration).toContain('JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id');
    expect(verificationMigration).toContain("gcp.status = 'active'");
    expect(verificationMigration).toContain('gc.verified IS TRUE');
    expect(verificationMigration).toContain('Active verified GC management is required before this approval can apply project changes');
    expect(homeownerConcierge).toContain("const canApproveGcProjectRecommendations = currentAssignment?.status === 'active' && assignedGc?.verified === true;");
    expect(homeownerConcierge).toContain("status === 'approved' && !canApproveGcProjectRecommendations");
    expect(homeownerConcierge).toContain('Active verified GC management is required before this recommendation can apply project changes.');
    expect(homeownerConcierge).toContain('const approvalLocked = pending && !canApproveGcProjectRecommendations;');
    expect(homeownerConcierge).toContain('disabled={approvalLocked}');
  });

  it('guards GC assignment creation against lifecycle and verification bypasses', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003800_guard_gc_assignment_creation.sql'),
      'utf8',
    );
    const inviteTermsMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616004643_lock_homeowner_gc_invite_terms.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_assignment_creation()');
    expect(migration).toContain("NEW.status <> 'invited'");
    expect(migration).toContain('GC assignment homeowner must own the project');
    expect(migration).toContain('gc.verified IS TRUE');
    expect(migration).toContain('Only verified General Contractors can be assigned to projects');
    expect(migration).toContain('COALESCE(NEW.initiated_by_gc, FALSE) IS TRUE');
    expect(migration).toContain('Only the selected GC can create a GC-initiated assignment');
    expect(migration).toContain('Only the homeowner can invite a GC to this project');
    expect(migration).toContain("existing.status <> 'removed'");
    expect(migration).toContain('This project already has a current GC assignment');
    expect(migration).toContain('guard_gc_assignment_creation_trigger');
    expect(inviteTermsMigration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_assignment_creation()');
    expect(inviteTermsMigration).toContain('v_gc public.general_contractors%ROWTYPE');
    expect(inviteTermsMigration).toContain('gc.verified IS TRUE');
    expect(inviteTermsMigration).toContain('NEW.markup_pct := v_gc.default_markup_pct');
    expect(inviteTermsMigration).toContain('NEW.concierge_fee_pct := v_gc.default_concierge_fee_pct');
    expect(inviteTermsMigration).toContain('Only the selected GC can create a GC-initiated assignment');
    expect(inviteTermsMigration).toContain('Only the homeowner can invite a GC to this project');
  });

  it('keeps GC verification and review metrics backend maintained', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003900_guard_gc_trust_fields.sql'),
      'utf8',
    );
    const businessOnboarding = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/onboarding/business.tsx'),
      'utf8',
    );
    const createTestUser = fs.readFileSync(
      path.join(repoRoot, 'supabase/functions/create-test-user/index.ts'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_trust_fields()');
    expect(migration).toContain("(SELECT auth.role()) = 'service_role'");
    expect(migration).toContain('COALESCE(NEW.verified, FALSE) IS TRUE');
    expect(migration).toContain('NEW.rating IS NOT NULL');
    expect(migration).toContain('COALESCE(NEW.total_reviews, 0) <> 0');
    expect(migration).toContain('NEW.verified IS DISTINCT FROM OLD.verified');
    expect(migration).toContain('NEW.rating IS DISTINCT FROM OLD.rating');
    expect(migration).toContain('NEW.total_reviews IS DISTINCT FROM OLD.total_reviews');
    expect(migration).toContain('GC verification and review metrics are maintained by WalkerAI backend services');
    expect(migration).toContain('guard_gc_trust_fields_trigger');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.guard_gc_trust_fields()');
    expect(businessOnboarding).not.toContain('verified:');
    expect(businessOnboarding).not.toContain('rating:');
    expect(businessOnboarding).not.toContain('total_reviews:');
    expect(createTestUser).toContain('verified: true');
  });

  it('keeps account roles and GC profiles aligned at the database boundary', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615004000_guard_account_role_boundaries.sql'),
      'utf8',
    );
    const auth = fs.readFileSync(
      path.join(repoRoot, 'src/lib/supabase/auth.ts'),
      'utf8',
    );
    const editProfile = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/edit-profile.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_user_identity_fields()');
    expect(migration).toContain("(SELECT auth.role()) = 'service_role'");
    expect(migration).toContain('NEW.role IS DISTINCT FROM OLD.role');
    expect(migration).toContain('NEW.email IS DISTINCT FROM OLD.email');
    expect(migration).toContain('User email and account role are maintained by WalkerAI authentication services');
    expect(migration).toContain('guard_user_identity_fields_trigger');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_profile_user_role()');
    expect(migration).toContain("u.role = 'general_contractor'");
    expect(migration).toContain('General Contractor profiles can only belong to general_contractor users');
    expect(migration).toContain('guard_gc_profile_user_role_trigger');
    expect(auth).toContain("options: {\n      data: { role },\n    },");
    expect(editProfile).not.toContain('role:');
  });

  it('keeps GC approval request details immutable after submission', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003500_guard_gc_approval_request_updates.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_approval_request_updates()');
    expect(migration).toContain("(SELECT auth.role()) = 'service_role'");
    expect(migration).toContain("OLD.status <> 'pending'");
    expect(migration).toContain('NEW.requested_by_gc_id IS DISTINCT FROM OLD.requested_by_gc_id');
    expect(migration).toContain('NEW.request_type IS DISTINCT FROM OLD.request_type');
    expect(migration).toContain('NEW.title IS DISTINCT FROM OLD.title');
    expect(migration).toContain('NEW.cost_delta IS DISTINCT FROM OLD.cost_delta');
    expect(migration).toContain('NEW.timeline_delta_days IS DISTINCT FROM OLD.timeline_delta_days');
    expect(migration).toContain('NEW.metadata IS DISTINCT FROM OLD.metadata');
    expect(migration).toContain('GC approval request details cannot be changed after submission');
    expect(migration).toContain('guard_gc_approval_request_updates_trigger');
  });

  it('restricts GC approval status transitions to the proper actor', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615231628_restrict_gc_approval_status_transitions.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_approval_request_updates()');
    expect(migration).toContain("IF NEW.status IN ('approved', 'rejected') THEN");
    expect(migration).toContain('Only the homeowner can approve or reject a GC approval request');
    expect(migration).toContain("ELSIF NEW.status = 'cancelled' THEN");
    expect(migration).toContain('Only the requesting GC can cancel a GC approval request');
    expect(migration).toContain("ELSIF NEW.status = 'pending' THEN");
    expect(migration).toContain('Approval request status cannot be reset to pending');
    expect(migration).toContain('Approval request responses must include a response timestamp');
    expect(migration).toContain('guard_gc_approval_request_updates_trigger');
  });

  it('keeps GC payment and trade negotiation request terms immutable after submission', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003600_guard_gc_request_audit_fields.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_payment_request_updates()');
    expect(migration).toContain('NEW.general_contractor_id IS DISTINCT FROM OLD.general_contractor_id');
    expect(migration).toContain('NEW.request_kind IS DISTINCT FROM OLD.request_kind');
    expect(migration).toContain('NEW.amount_cents IS DISTINCT FROM OLD.amount_cents');
    expect(migration).toContain('GC payment request details cannot be changed after submission');
    expect(migration).toContain('guard_gc_payment_request_updates_trigger');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_updates()');
    expect(migration).toContain('NEW.quote_id IS DISTINCT FROM OLD.quote_id');
    expect(migration).toContain('NEW.company_id IS DISTINCT FROM OLD.company_id');
    expect(migration).toContain('NEW.offer_amount_cents IS DISTINCT FROM OLD.offer_amount_cents');
    expect(migration).toContain('NEW.scope_note IS DISTINCT FROM OLD.scope_note');
    expect(migration).toContain('GC trade negotiation details cannot be changed after submission');
    expect(migration).toContain('guard_gc_trade_negotiation_updates_trigger');
  });

  it('restricts GC payment and trade negotiation status transitions to the proper actor', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615234901_restrict_gc_payment_trade_status_transitions.sql'),
      'utf8',
    );
    const paymentApprovalMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616000856_require_verified_gc_payment_approval.sql'),
      'utf8',
    );
    const tradeAcceptanceMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616001136_require_verified_gc_trade_acceptance.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_payment_request_updates()');
    expect(migration).toContain("IF NEW.status IN ('approved', 'rejected') THEN");
    expect(migration).toContain('Only the homeowner can approve or reject a GC payment request');
    expect(migration).toContain('GC payment request responses must include a response timestamp');
    expect(migration).toContain("ELSIF NEW.status = 'cancelled' THEN");
    expect(migration).toContain('Only the requesting GC can cancel a GC payment request');
    expect(migration).toContain('GC payment request cancellations must include a cancellation timestamp');
    expect(migration).toContain('GC payment request cancellations cannot include response details');
    expect(paymentApprovalMigration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_payment_request_updates()');
    expect(paymentApprovalMigration).toContain("NEW.status = 'approved'");
    expect(paymentApprovalMigration).toContain('JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id');
    expect(paymentApprovalMigration).toContain("gcp.status = 'active'");
    expect(paymentApprovalMigration).toContain('gc.verified IS TRUE');
    expect(paymentApprovalMigration).toContain('Active verified GC management is required before approving a GC payment request');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_updates()');
    expect(migration).toContain("IF NEW.status IN ('accepted', 'rejected', 'revision_requested') THEN");
    expect(migration).toContain('Only the quoted company can respond to a GC trade negotiation');
    expect(migration).toContain('GC trade negotiation responses must include a response timestamp');
    expect(migration).toContain('Only the requesting GC can cancel a GC trade negotiation');
    expect(migration).toContain('GC trade negotiation cancellations must include a cancellation timestamp');
    expect(migration).toContain('GC trade negotiation cancellations cannot include response details');
    expect(tradeAcceptanceMigration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_updates()');
    expect(tradeAcceptanceMigration).toContain("NEW.status = 'accepted'");
    expect(tradeAcceptanceMigration).toContain('JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id');
    expect(tradeAcceptanceMigration).toContain("gcp.status = 'active'");
    expect(tradeAcceptanceMigration).toContain('gc.verified IS TRUE');
    expect(tradeAcceptanceMigration).toContain('Active verified GC management is required before accepting a GC trade negotiation');
  });

  it('requires GC approval, payment, and trade requests to start pending', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615004200_guard_gc_request_insert_statuses.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_project_approval_request_insert()');
    expect(migration).toContain("NEW.status <> 'pending'");
    expect(migration).toContain('NEW.response_note IS NOT NULL');
    expect(migration).toContain('NEW.responded_at IS NOT NULL');
    expect(migration).toContain('GC approval requests must start pending without response details');
    expect(migration).toContain("NULLIF(TRIM(NEW.title), '') IS NULL");
    expect(migration).toContain('guard_project_approval_request_insert_trigger');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_payment_request_insert()');
    expect(migration).toContain('NEW.cancelled_at IS NOT NULL');
    expect(migration).toContain('GC payment requests must start pending without response details');
    expect(migration).toContain('guard_gc_payment_request_insert_trigger');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_trade_negotiation_insert()');
    expect(migration).toContain('NEW.company_response_note IS NOT NULL');
    expect(migration).toContain("NULLIF(TRIM(NEW.scope_note), '') IS NULL");
    expect(migration).toContain('GC trade negotiations must start pending without response details');
    expect(migration).toContain('guard_gc_trade_negotiation_insert_trigger');
  });

  it('supports GC-initiated homeowner-owned draft projects with homeowner confirmation', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000400_add_gc_project_creation_rpc.sql'),
      'utf8',
    );
    const contactMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002300_add_gc_project_client_contact.sql'),
      'utf8',
    );
    const transactionalContactMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002700_create_gc_project_with_contact.sql'),
      'utf8',
    );
    const notificationMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002800_gc_project_management_notification.sql'),
      'utf8',
    );
    const projectTypeMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002900_add_gc_project_type.sql'),
      'utf8',
    );
    const coordinateMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615004400_require_gc_project_coordinates.sql'),
      'utf8',
    );
    const requiredContextMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616002245_require_gc_project_scope_contact.sql'),
      'utf8',
    );
    const homeownerConfirmationMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003200_secure_homeowner_gc_confirmation.sql'),
      'utf8',
    );
    const homeownerRemovalMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003700_remove_gc_management_assignment.sql'),
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
    const enums = fs.readFileSync(
      path.join(repoRoot, 'src/constants/enums.ts'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.create_gc_managed_project');
    expect(migration).toContain("role = 'homeowner'");
    expect(migration).toContain("v_gc.verified IS NOT TRUE");
    expect(migration).toContain('initiated_by_gc');
    expect(migration).toContain("'draft'");
    expect(navigator).toContain('GeneralContractorCreateProject');
    expect(dashboard).toContain("navigation.navigate('GeneralContractorCreateProject')");
    expect(dashboard).toContain('homeowner_contact_name, homeowner_contact_email, homeowner_contact_phone');
    expect(dashboard).toContain('projectContact');
    expect(dashboard).toContain('project_type, scope_summary');
    expect(dashboard).toContain('formatGcProjectType(assignment.project_type, project?.room_type)');
    expect(dashboard).toContain("const dashboardStatus = assignment.status === 'invited'");
    expect(dashboard).toContain('label={formatStatusLabel(dashboardStatus)}');
    expect(dashboard).toContain('variant={projectStatusVariant(dashboardStatus)}');
    expect(dashboard).toContain('When you create a homeowner draft, a homeowner invites you, or a project is assigned for concierge management, it will appear here.');
    expect(createProject).toContain("supabase.rpc('create_gc_managed_project'");
    expect(createProject).toContain('GC_PROJECT_TYPES.map');
    expect(enums).toContain("'flooring'");
    expect(enums).toContain("'painting'");
    expect(enums).toContain("'basement'");
    expect(enums).toContain("'addition'");
    expect(createProject).toContain('Homeowner name');
    expect(createProject).toContain('Homeowner phone');
    expect(createProject).toContain('Homeowner name required');
    expect(createProject).toContain('Scope required');
    expect(createProject).toContain('p_homeowner_contact_name: contactName');
    expect(createProject).toContain('p_homeowner_contact_phone: contactPhone || null');
    expect(createProject).not.toContain(".from('general_contractor_projects')\n        .update");
    expect(homeownerConcierge).toContain('Confirm GC Management');
    expect(homeownerConcierge).toContain("supabase.rpc('confirm_gc_management_assignment'");
    expect(homeownerConcierge).toContain('Remove GC Management');
    expect(homeownerConcierge).toContain("supabase.rpc('remove_gc_management_assignment'");
    expect(homeownerConcierge).toContain('Pending GC recommendations will no longer apply project changes');
    expect(homeownerConcierge).not.toContain(".from('general_contractor_projects')\n              .update({ status: 'active' })");
    expect(homeownerConcierge).not.toContain(".from('general_contractor_projects')\n              .update({ status: 'removed' })");
    expect(homeownerConcierge).toContain('project_type, scope_summary');
    expect(homeownerConcierge).toContain('formatGcProjectType(currentAssignment.project_type)');
    expect(homeownerConcierge).toContain('currentAssignment.scope_summary');
    expect(homeownerConcierge).toContain('function gcAssignmentStatusVariant');
    expect(homeownerConcierge).toContain('variant={gcAssignmentStatusVariant(currentAssignment.status)}');
    expect(homeownerConcierge).not.toContain('label={formatStatusLabel(currentAssignment.status)} variant="pending"');
    expect(gcProjectDetail).toContain('homeowner_contact_name, homeowner_contact_email, homeowner_contact_phone');
    expect(gcProjectDetail).toContain('Homeowner contact');
    expect(gcProjectDetail).toContain('Waiting for the homeowner to confirm GC management');
    expect(gcProjectDetail).toContain('project_type, scope_summary');
    expect(gcProjectDetail).toContain('formatGcProjectType(assignment?.project_type, project?.room_type)');
    expect(contactMigration).toContain('ADD COLUMN IF NOT EXISTS homeowner_contact_name');
    expect(contactMigration).toContain('ADD COLUMN IF NOT EXISTS homeowner_contact_email');
    expect(contactMigration).toContain('ADD COLUMN IF NOT EXISTS homeowner_contact_phone');
    expect(contactMigration).toContain('populate_gc_project_homeowner_contact');
    expect(transactionalContactMigration).toContain('DROP FUNCTION IF EXISTS public.create_gc_managed_project');
    expect(transactionalContactMigration).toContain('p_homeowner_contact_name TEXT DEFAULT NULL');
    expect(transactionalContactMigration).toContain('homeowner_contact_name');
    expect(transactionalContactMigration).toContain('homeowner_contact_phone');
    expect(notificationMigration).toContain("'gc_management_invited'");
    expect(notificationMigration).not.toContain("'new_message'");
    expect(projectTypeMigration).toContain('ADD COLUMN IF NOT EXISTS project_type');
    expect(projectTypeMigration).toContain("'flooring', 'painting', 'basement', 'addition', 'other'");
    expect(projectTypeMigration).toContain("CASE WHEN v_project_type IN ('kitchen', 'bathroom') THEN v_project_type ELSE NULL END");
    expect(projectTypeMigration).not.toContain('Project type must be kitchen or bathroom');
    expect(coordinateMigration).toContain('CREATE OR REPLACE FUNCTION public.create_gc_managed_project');
    expect(coordinateMigration).toContain('p_lat IS NULL');
    expect(coordinateMigration).toContain('p_lng IS NULL');
    expect(coordinateMigration).toContain('p_lat < -90');
    expect(coordinateMigration).toContain('p_lng > 180');
    expect(coordinateMigration).toContain('Valid project coordinates are required before creating managed projects');
    expect(coordinateMigration).toContain("CASE WHEN v_project_type IN ('kitchen', 'bathroom') THEN v_project_type ELSE NULL END");
    expect(requiredContextMigration).toContain('CREATE OR REPLACE FUNCTION public.create_gc_managed_project');
    expect(requiredContextMigration).toContain('v_scope_summary TEXT');
    expect(requiredContextMigration).toContain('v_homeowner_contact_name TEXT');
    expect(requiredContextMigration).toContain("IF v_scope_summary = '' THEN");
    expect(requiredContextMigration).toContain('Scope summary is required before creating managed projects');
    expect(requiredContextMigration).toContain("IF v_homeowner_contact_name = '' THEN");
    expect(requiredContextMigration).toContain('Homeowner contact name is required before creating managed projects');
    expect(requiredContextMigration).toContain('REVOKE ALL ON FUNCTION public.create_gc_managed_project');
    expect(requiredContextMigration).toContain('GRANT EXECUTE ON FUNCTION public.create_gc_managed_project');
    expect(homeownerConfirmationMigration).toContain('DROP POLICY IF EXISTS "gc_projects_homeowner_update"');
    expect(homeownerConfirmationMigration).toContain('CREATE OR REPLACE FUNCTION public.confirm_gc_management_assignment');
    expect(homeownerConfirmationMigration).toContain('homeowner_id = (SELECT auth.uid())');
    expect(homeownerConfirmationMigration).toContain('v_assignment.initiated_by_gc IS NOT TRUE');
    expect(homeownerConfirmationMigration).toContain("v_assignment.status <> 'invited'");
    expect(homeownerConfirmationMigration).toContain("SET status = 'active'");
    expect(homeownerRemovalMigration).toContain('CREATE OR REPLACE FUNCTION public.remove_gc_management_assignment');
    expect(homeownerRemovalMigration).toContain('homeowner_id = (SELECT auth.uid())');
    expect(homeownerRemovalMigration).toContain("v_assignment.status NOT IN ('invited', 'active')");
    expect(homeownerRemovalMigration).toContain("SET status = 'removed'");
    expect(homeownerRemovalMigration).toContain('GRANT EXECUTE ON FUNCTION public.remove_gc_management_assignment(UUID) TO authenticated');
  });

  it('counts real GC homeowner actions on the dashboard approval metric', () => {
    const dashboard = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/index.tsx'),
      'utf8',
    );

    expect(dashboard).toContain("const activeAssignments = assignments.filter((item) => item.status === 'active');");
    expect(dashboard).toContain("label: 'Active'");
    expect(dashboard).not.toContain("item.status === 'active' || item.status === 'invited'");
    expect(dashboard).toContain("from('project_approval_requests')");
    expect(dashboard).toContain("from('gc_payment_requests')");
    expect(dashboard).toContain("from('gc_concierge_bookings')");
    expect(dashboard).toContain("eq('requested_by_gc_id', profile.id)");
    expect(dashboard).toContain("eq('general_contractor_id', profile.id)");
    expect(dashboard).toContain("eq('payment_status', 'paid')");
    expect(dashboard).toContain("is('payout_released_at', null)");
    expect(dashboard).not.toContain("from('change_orders')");
  });

  it('shows GC dashboard load failures before setup or verification empty states', () => {
    const dashboard = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/index.tsx'),
      'utf8',
    );

    expect(dashboard).toContain('if (!loading && errorMessage)');
    expect(dashboard).toContain('Could not load GC desk');
    expect(dashboard).toContain('<Text style={styles.pendingSubtitle}>{errorMessage}</Text>');
    expect(dashboard).toContain('<Text style={styles.onboardCtaText}>Try Again</Text>');
    expect(dashboard.indexOf('if (!loading && errorMessage)')).toBeLessThan(
      dashboard.indexOf('if (!loading && (!gc || setupRoute || !gc.verified))'),
    );
  });

  it('surfaces the GC markup engine on managed project detail', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002200_apply_gc_terms_approval.sql'),
      'utf8',
    );
    const budgetMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002600_apply_gc_budget_approval.sql'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(gcProjectDetail).toContain("import { calculateGcMarkup } from '@/lib/gc-markup'");
    expect(gcProjectDetail).toContain('Markup engine');
    expect(gcProjectDetail).toContain('Homeowner-facing total');
    expect(gcProjectDetail).toContain('Estimated GC revenue');
    expect(gcProjectDetail).toContain('Send Budget for Approval');
    expect(gcProjectDetail).toContain("action: 'update_gc_budget'");
    expect(gcProjectDetail).toContain('proposed_ai_cost_min: budgetMin');
    expect(gcProjectDetail).toContain('proposed_ai_cost_max: budgetMax');
    expect(gcProjectDetail).toContain('Send Terms for Approval');
    expect(gcProjectDetail).toContain("action: 'update_gc_terms'");
    expect(gcProjectDetail).toContain("from('project_approval_requests').insert");
    expect(migration).toContain("v_request.metadata->>'action' = 'update_gc_terms'");
    expect(migration).toContain('markup_pct = v_markup_pct');
    expect(migration).toContain('concierge_fee_pct = v_concierge_fee_pct');
    expect(migration).toContain("AND status = 'active'");
    expect(budgetMigration).toContain("v_request.metadata->>'action' = 'update_gc_budget'");
    expect(budgetMigration).toContain('ai_cost_min = v_budget_min');
    expect(budgetMigration).toContain('ai_cost_max = v_budget_max');
    expect(budgetMigration).toContain("status = CASE WHEN status = 'draft' THEN 'brief_ready' ELSE status END");
  });

  it('supports externally managed trades without treating them as WalkerAI verified', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000500_add_external_trade_management.sql'),
      'utf8',
    );
    const directWriteMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615232959_require_verified_gc_direct_writes.sql'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const homeownerProject = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/index.tsx'),
      'utf8',
    );
    const homeownerSchedule = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/schedule.tsx'),
      'utf8',
    );

    expect(migration).toContain("fulfillment_type IN ('walker_ai', 'external')");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.mark_project_slot_externally_managed');
    expect(migration).toContain('Active GC management is required before marking external trades');
    expect(directWriteMigration).toContain('CREATE OR REPLACE FUNCTION public.mark_project_slot_externally_managed');
    expect(directWriteMigration).toContain('Only verified General Contractors can mark external trades');
    expect(migration).toContain("status = 'filled'");
    expect(gcProjectDetail).toContain("supabase.rpc('mark_project_slot_externally_managed'");
    expect(gcProjectDetail).toContain('Mark externally managed');
    expect(gcProjectDetail).toContain('No escrow protection');
    expect(homeownerProject).toContain('Externally managed by GC');
    expect(homeownerProject).toContain('No escrow protection');
    expect(homeownerSchedule).toContain('function isSchedulableSlot(slot: Slot)');
    expect(homeownerSchedule).toContain("slot.fulfillment_type === 'external'");
    expect(homeownerSchedule).toContain('walkerAiSchedulableSlots');
    expect(homeownerSchedule).toContain('External scope is not managed by WalkerAI escrow.');
  });

  it('stores external trade documents without paid WalkerAI verification', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002100_add_external_trade_documents.sql'),
      'utf8',
    );
    const directWriteMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615232959_require_verified_gc_direct_writes.sql'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(migration).toContain('external_trade_document_urls');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.add_external_trade_document');
    expect(migration).toContain("external_trade_verification_status = CASE");
    expect(migration).toContain("'documents_uploaded'");
    expect(migration).toContain('Active GC management is required before adding external trade documents');
    expect(directWriteMigration).toContain('CREATE OR REPLACE FUNCTION public.add_external_trade_document');
    expect(directWriteMigration).toContain('Only verified General Contractors can add external trade documents');
    expect(gcProjectDetail).toContain("uploadFile('company-docs'");
    expect(gcProjectDetail).toContain('Please sign in again before uploading trade documents.');
    expect(gcProjectDetail).toContain('external-trades/${currentUser.id}/${projectId}/${slot.id}-');
    expect(gcProjectDetail).toContain("supabase.rpc('add_external_trade_document'");
    expect(gcProjectDetail).toContain('Upload docs');
    expect(gcProjectDetail).toContain('No license or insurance documents uploaded');
  });

  it('applies approved GC external trade recommendations only for unassigned slots', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002000_apply_trade_substitution_approval.sql'),
      'utf8',
    );
    const gcTrades = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/trades.tsx'),
      'utf8',
    );

    expect(migration).toContain("v_request.request_type = 'trade_substitution'");
    expect(migration).toContain("fulfillment_type = 'external'");
    expect(migration).toContain("external_trade_verification_status = 'unverified'");
    expect(migration).toContain('assigned_company_id IS NULL');
    expect(migration).toContain('no WalkerAI escrow protection');
    expect(gcTrades).toContain('external_management_requested');
    expect(gcTrades).toContain('WalkerAI-assigned trades are not removed automatically');
  });

  it('routes GC schedule recommendations through homeowner approval before dates apply', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000600_apply_schedule_approval_requests.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcSchedule = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/schedule.tsx'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(migration).toContain('respond_to_project_approval_request');
    expect(migration).toContain("v_request.request_type = 'schedule_change'");
    expect(migration).toContain('scheduled_start_date = v_start_date');
    expect(navigator).toContain('GeneralContractorSchedule');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorSchedule'");
    expect(gcSchedule).toContain("request_type: 'schedule_change'");
    expect(gcSchedule).toContain('Send Schedule for Approval');
    expect(homeownerConcierge).toContain("supabase.rpc('respond_to_project_approval_request'");
  });

  it('allows active GCs to coordinate permits and inspections for managed projects', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000700_allow_gc_permit_management.sql'),
      'utf8',
    );
    const directWriteMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615232959_require_verified_gc_direct_writes.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcPermits = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/permits.tsx'),
      'utf8',
    );

    expect(migration).toContain('permits_gc_managed');
    expect(migration).toContain("gcp.status = 'active'");
    expect(migration).toContain('permits_gc_managed_insert');
    expect(directWriteMigration).toContain('DROP POLICY IF EXISTS "permits_gc_managed"');
    expect(directWriteMigration).toContain('DROP POLICY IF EXISTS "permits_gc_managed_insert"');
    expect(directWriteMigration).toContain('DROP POLICY IF EXISTS "permits_gc_managed_update"');
    expect(directWriteMigration).toMatch(/permits_gc_managed[\s\S]*gc\.verified IS TRUE/);
    expect(directWriteMigration).toMatch(/permits_gc_managed_insert[\s\S]*gc\.verified IS TRUE/);
    expect(directWriteMigration).toMatch(/permits_gc_managed_update[\s\S]*gc\.verified IS TRUE/);
    expect(navigator).toContain('GeneralContractorPermits');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorPermits'");
    expect(gcPermits).toContain("select('id, status')");
    expect(gcPermits).toContain("assignmentRow?.status !== 'active'");
    expect(gcPermits).toContain('Permits locked');
    expect(gcPermits).toContain('The homeowner must confirm active GC management before permits, inspections, or uploaded documents can be managed.');
    expect(gcPermits).toContain("from('permits').insert");
    expect(gcPermits).toContain("assignment?.status !== 'active'");
    expect(gcPermits).toContain('Upload Document');
    expect(gcPermits).toContain('inspection_scheduled');
    expect(gcPermits).toContain('handleOpenDocument(previewUrl)');
    expect(gcPermits).not.toContain('void Linking.openURL(previewUrl)');
  });

  it('lets GCs request payment draws while homeowner approval remains separate from escrow release', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000800_add_gc_payment_requests.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcPayments = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/payments.tsx'),
      'utf8',
    );
    const gcApprovals = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/approvals.tsx'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.gc_payment_requests');
    expect(migration).toContain("request_kind IN ('deposit', 'progress_draw', 'final_payment')");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.respond_to_gc_payment_request');
    expect(migration).not.toContain('stripe.transfers');
    expect(navigator).toContain('GeneralContractorPayments');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorPayments'");
    expect(gcProjectDetail).not.toContain("{ value: 'payment_release', label: 'Payment' }");
    expect(gcProjectDetail).toContain('Payment authorizations belong in Payment requests so escrow and milestone workflows stay separate.');
    expect((gcPayments.match(/\.eq\('general_contractor_id', gc\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(gcPayments).toContain("from('gc_payment_requests').insert");
    expect(gcPayments).toContain('handleCancelRequest');
    expect(gcPayments).toContain("status: 'cancelled'");
    expect(gcPayments).toContain('cancelled_at: new Date().toISOString()');
    expect(gcPayments).toContain(".eq('status', 'pending')");
    expect(gcPayments).toContain('No escrow or milestone funds are moved.');
    expect(gcPayments).toContain('disabled={!!cancellingRequestId}');
    expect(gcPayments).toContain('Funds are still released through existing escrow milestones');
    expect(gcApprovals).toContain("from('gc_payment_requests')");
    expect(gcApprovals).toContain('Payment requests');
    expect(gcApprovals).toContain("navigation.navigate('GeneralContractorPayments'");
    expect(gcApprovals).toContain('Escrow release still happens through milestones');
    expect(homeownerConcierge).toContain("from('gc_payment_requests')");
    expect(homeownerConcierge).toContain("supabase.rpc('respond_to_gc_payment_request'");
    expect(homeownerConcierge).toContain('Approving this records your authorization. It does not bypass milestone escrow release.');
    expect(homeownerConcierge).toContain("currentAssignment?.status === 'active' && assignedGc?.verified === true");
    expect(homeownerConcierge).toContain("status === 'approved' && !canApproveGcPaymentRequests");
    expect(homeownerConcierge).toContain('Active verified GC management is required before a payment request can be approved.');
    expect(homeownerConcierge).toContain('disabled={!canApproveGcPaymentRequests}');
  });

  it('lets GCs recommend material substitutions without bypassing homeowner approval', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000900_add_gc_material_recommendations.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcMaterials = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/materials.tsx'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(migration).toContain('materials_gc_managed_select');
    expect(migration).toContain("v_request.request_type = 'material_substitution'");
    expect(migration).toContain('specific_model = v_product_name');
    expect(navigator).toContain('GeneralContractorMaterials');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorMaterials'");
    expect(gcMaterials).toContain("request_type: 'material_substitution'");
    expect(gcMaterials).toContain("from('supplier_catalog')");
    expect(gcMaterials).toContain('Supplier catalog reference');
    expect(gcMaterials).toContain('applyCatalogSuggestion');
    expect(gcMaterials).toContain('lead_time_days');
    expect(gcMaterials).toContain('price_per_unit');
    expect(gcMaterials).toContain('function parseWholeDays(value: string): number | null');
    expect(gcMaterials).toContain("if (!/^\\d+$/.test(trimmed)) return null;");
    expect(gcMaterials).not.toContain('Number.parseInt(leadTimeInput');
    expect(gcMaterials).toContain('Send Material Recommendation');
    expect(gcMaterials).toContain('Homeowner approval is required before the material preference changes.');
    expect(homeownerConcierge).toContain('Approving updates the project material preference fields.');
  });

  it('gives GCs a discovery and scope-change approval workflow instead of bypassing change orders', () => {
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcDiscovery = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/discovery.tsx'),
      'utf8',
    );

    expect(navigator).toContain('GeneralContractorDiscovery');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorDiscovery'");
    expect(gcDiscovery).toContain(".eq('requested_by_gc_id', gc.id)");
    expect(gcDiscovery).toContain("from('project_approval_requests').insert");
    expect(gcDiscovery).toContain("request_type: requestType");
    expect(gcDiscovery).toContain("value: 'change_order'");
    expect(gcDiscovery).toContain('No discovery or scope change becomes active until the homeowner approves it.');
    expect(gcDiscovery).toContain('function parseSignedWholeDays(value: string): number | null');
    expect(gcDiscovery).toContain("if (!/^-?\\d+$/.test(trimmed)) return null;");
    expect(gcDiscovery).not.toContain('Number.parseInt(timelineDelta');
    expect(gcDiscovery).not.toContain("from('change_orders').insert");
  });

  it('lets GCs participate in the project communication thread', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001000_allow_gc_project_messages.sql'),
      'utf8',
    );
    const verificationMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615235914_require_verified_gc_message_writes.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcMessages = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/messages.tsx'),
      'utf8',
    );
    const homeownerMessages = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/messages.tsx'),
      'utf8',
    );

    expect(migration).toContain('messages_project_participants');
    expect(migration).toContain('general_contractor_projects gcp');
    expect(migration).toContain("gcp.status IN ('invited', 'active', 'completed')");
    expect(verificationMigration).toContain('messages_project_participants_select');
    expect(verificationMigration).toContain('messages_project_participants_insert');
    expect(verificationMigration).toContain('sender_id = (SELECT auth.uid())');
    expect(verificationMigration).toMatch(/gc\.verified IS TRUE[\s\S]*gcp\.status IN \('invited', 'active'\)/);
    expect(navigator).toContain('GeneralContractorMessages');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorMessages'");
    expect(gcMessages).toContain("from('messages').insert");
    expect(gcMessages).toContain("channel(`gc-messages:${projectId}`)");
    expect(gcMessages).toContain(".select('id, verified')");
    expect(gcMessages).toContain('WalkerAI verification is required before GC project messages can be sent.');
    expect(gcMessages).toContain("placeholder={canSendMessages ? 'Type a message...' : 'Messages locked'}");
    expect(homeownerMessages).toContain(".from('general_contractor_projects')");
    expect(homeownerMessages).toContain("general_contractor:general_contractors(business_name)");
    expect(homeownerMessages).toContain("Messages with your contractors, GC, and project participants");
    expect(homeownerMessages).not.toContain(".not('assigned_company_id', 'is', null)");
  });

  it('adds a GC completion binder assembled from real project records', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001100_allow_gc_warranty_binder_read.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcCompletion = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/completion.tsx'),
      'utf8',
    );

    expect(migration).toContain('warranties_gc_managed_select');
    expect(navigator).toContain('GeneralContractorCompletion');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorCompletion'");
    expect(gcCompletion).toContain("from('permits')");
    expect(gcCompletion).toContain("from('warranties')");
    expect(gcCompletion).toContain("from('material_orders')");
    expect(gcCompletion).toContain("from('project_approval_requests')");
    expect(gcCompletion).toContain('You need to be signed in to view the completion binder.');
    expect(gcCompletion).toContain(".eq('requested_by_gc_id', gc.id)");
    expect(gcCompletion).toContain("from('gc_payment_requests')");
    expect(gcCompletion).toContain(".eq('general_contractor_id', gc.id)");
    expect(gcCompletion).toContain("from('change_orders')");
    expect(gcCompletion).toContain('const pendingChangeOrders = changeOrders.filter');
    expect(gcCompletion).toContain("order.status === 'proposed' && order.signed_by_company && !order.signed_by_homeowner");
    expect(gcCompletion).toContain('+ pendingChangeOrders');
    expect(gcCompletion).toContain('Resolve pending approvals, payment requests, and change orders before requesting final project completion.');
    expect(gcCompletion).toContain('Change orders');
    expect(gcCompletion).toContain('pending homeowner decision');
    expect(gcCompletion).toContain('Digital project binder');
    expect(gcCompletion).toContain('const latestCompletionRequest = completionRequests[0];');
    expect(gcCompletion).toContain("const pendingCompletionRequest = completionRequests.find((approval) => approval.status === 'pending');");
    expect(gcCompletion).toContain('&& !pendingCompletionRequest');
  });

  it('gives GCs trade management visibility without bypassing homeowner approval', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001200_allow_gc_trade_quote_read.sql'),
      'utf8',
    );
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcTrades = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/trades.tsx'),
      'utf8',
    );

    expect(migration).toContain('general_contractor_projects gcp');
    expect(migration).toContain("gcp.status = 'active'");
    expect(navigator).toContain('GeneralContractorTrades');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorTrades'");
    expect(gcTrades).toContain("from('project_slots')");
    expect(gcTrades).toContain("from('quotes')");
    expect(gcTrades).toContain("supabase.functions.invoke('generate-trade-slots'");
    expect(gcTrades).toContain('Generate Trade Plan');
    expect(gcTrades).toContain('The homeowner must confirm GC management before you can generate trade slots.');
    expect(gcTrades).toContain("supabase.functions.invoke<DispatchResult>('dispatch-slots'");
    expect(gcTrades).toContain('WalkerAI trade marketplace');
    expect(gcTrades).toContain('Dispatch ${dispatchableSlotCount} Open Slot');
    expect(gcTrades).toContain('The homeowner must confirm GC management before you can dispatch WalkerAI trades.');
    expect(gcTrades).toContain("request_type: 'trade_substitution'");
    expect(gcTrades).toContain('No trade assignment changes until the homeowner approves');
    expect(gcTrades).not.toContain("from('project_slots').update");
  });

  it('adds fixed-price GC concierge booking requests with the 80/20 split', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001300_add_gc_concierge_bookings.sql'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );
    const gcApprovals = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/approvals.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.gc_concierge_bookings');
    expect(migration).toContain("'virtual_30'");
    expect(migration).toContain('v_price := 9900');
    expect(migration).toContain('v_contractor_payout := ROUND(v_price * 0.80)::INTEGER');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.request_gc_concierge_booking');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.respond_to_gc_concierge_booking');
    expect(homeownerConcierge).toContain("supabase.rpc('request_gc_concierge_booking'");
    expect(homeownerConcierge).toContain('Contractor payout is 80%; WalkerAI keeps 20%.');
    expect(gcApprovals).toContain("from('gc_concierge_bookings')");
    expect(gcApprovals).toContain("supabase.rpc('respond_to_gc_concierge_booking'");
  });

  it('requires GC concierge availability before accepting stale booking requests', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615004300_require_available_gc_concierge_acceptance.sql'),
      'utf8',
    );
    const gcApprovals = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/approvals.tsx'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.respond_to_gc_concierge_booking');
    expect(migration).toContain("p_status = 'accepted'");
    expect(migration).toContain('verified IS TRUE AND concierge_enabled IS TRUE');
    expect(migration).toContain('v_gc_available IS NOT TRUE');
    expect(migration).toContain('Only verified concierge-enabled GCs can accept concierge bookings');
    expect(migration).toContain('Only the requested GC can respond to this booking');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.respond_to_gc_concierge_booking(UUID, TEXT, TEXT) TO authenticated');
    expect(gcApprovals).toContain(".select('id, verified, concierge_enabled')");
    expect(gcApprovals).toContain('setCanAcceptConciergeBookings(gc.verified === true && gc.concierge_enabled === true)');
    expect(gcApprovals).toContain("status === 'accepted' && !canAcceptConciergeBookings");
    expect(gcApprovals).toContain('WalkerAI verification and concierge marketplace access are required before this request can be accepted.');
    expect(gcApprovals).toContain('disabled={!canAcceptConciergeBookings || !!respondingBookingId}');
    expect(gcApprovals).toContain('disabled={!!respondingBookingId}');
    expect(homeownerConcierge).toContain('concierge_enabled, verified');
    expect(homeownerConcierge).toContain("Pick<GeneralContractor, 'id' | 'business_name' | 'concierge_enabled' | 'verified'>");
    expect(homeownerConcierge).toContain('assignedGc?.verified === true && assignedGc.concierge_enabled === true');
    expect(homeownerConcierge).toContain('WalkerAI verification is required before this GC can accept concierge service requests.');
    expect(homeownerConcierge).toContain('WalkerAI verification is required before this GC can accept new concierge service requests.');
  });

  it('adds a deterministic GC project assistant from live project records', () => {
    const navigator = fs.readFileSync(
      path.join(repoRoot, 'src/navigation/GeneralContractorNavigator.tsx'),
      'utf8',
    );
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );
    const gcAssistant = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/assistant.tsx'),
      'utf8',
    );

    expect(navigator).toContain('GeneralContractorAssistant');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorAssistant'");
    expect(gcAssistant).toContain('You need to be signed in to view project assistant summaries.');
    expect(gcAssistant).toContain(".from('general_contractors')");
    expect(gcAssistant).toContain(".from('general_contractor_projects')");
    expect(gcAssistant).toContain(".select('id, status, general_contractor_id, project_type')");
    expect(gcAssistant).toContain(".eq('general_contractor_id', gc.id)");
    expect(gcAssistant).toContain("assignmentRow.status !== 'active'");
    expect(gcAssistant).toContain('Active GC management is required before project assistant summaries are available.');
    expect(gcAssistant).toContain('formatGcProjectType(assignment?.project_type, project?.room_type)');
    expect(gcAssistant).toContain("from('project_slots')");
    expect(gcAssistant).toContain("from('permits')");
    expect(gcAssistant).toContain("from('project_approval_requests')");
    expect(gcAssistant).toContain(".eq('requested_by_gc_id', gc.id)");
    expect(gcAssistant).toContain("from('gc_payment_requests')");
    expect(gcAssistant).toContain(".eq('general_contractor_id', gc.id)");
    expect(gcAssistant).toContain("from('material_orders')");
    expect(gcAssistant).toContain("from('messages')");
    expect(gcAssistant).toContain('No manual edits or AI assumptions are applied.');
  });

  it('shows modern GC approval requests in the GC approvals inbox', () => {
    const gcApprovals = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/approvals.tsx'),
      'utf8',
    );

    expect(gcApprovals).toContain("from('project_approval_requests')");
    expect(gcApprovals).toContain("eq('requested_by_gc_id', gc.id)");
    expect(gcApprovals).toContain("select('project_id, project_type')");
    expect(gcApprovals).toContain('projectTypeById.get(request.project_id)');
    expect(gcApprovals).toContain('formatGcProjectType(request.project_type, project?.room_type)');
    expect(gcApprovals).toContain('formatGcProjectType(approval.project_type, project?.room_type)');
    expect(gcApprovals).toContain('Homeowner approval requests');
    expect(gcApprovals).toContain("navigation.navigate('GeneralContractorProjectDetail'");
    expect(gcApprovals).toContain("request.cost_delta != null ? ` · ${formatSignedCadCents(request.cost_delta)}` : ''");
    expect(gcApprovals).toContain('Documented cost change: {formatSignedCadCents(approval.cost_delta)}');
    expect(gcApprovals).not.toContain('formatCad(Math.abs(approval.cost_delta))');
  });

  it('counts modern GC approval requests in project pending decisions', () => {
    const gcProjectDetail = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/index.tsx'),
      'utf8',
    );

    expect(gcProjectDetail).toContain('You need to be signed in to view managed projects.');
    expect(gcProjectDetail).toContain("const pendingApprovalRequests = approvalRequests.filter((request) => request.status === 'pending');");
    expect(gcProjectDetail).toContain(".eq('requested_by_gc_id', gc.id)");
    expect(gcProjectDetail).toContain('const pendingApprovals = pendingChangeOrders.length + pendingApprovalRequests.length;');
    expect(gcProjectDetail).toContain('pendingDecisionApprovalRequests.map');
    expect(gcProjectDetail).toContain('pendingDecisionChangeOrders.map');
    expect(gcProjectDetail).toContain("key={`approval-${request.id}`}");
    expect(gcProjectDetail).toContain("key={`change-order-${order.id}`}");
    expect(gcProjectDetail).toContain('handleCancelApprovalRequest');
    expect(gcProjectDetail).toContain("from('project_approval_requests')");
    expect(gcProjectDetail).toContain("update({ status: 'cancelled' })");
    expect(gcProjectDetail).toContain(".eq('requested_by_gc_id', assignment.general_contractor_id)");
    expect(gcProjectDetail).toContain(".eq('status', 'pending')");
    expect(gcProjectDetail).toContain('No project budget, schedule, trade, material, or completion change will be applied.');
    expect(gcProjectDetail).toContain('disabled={!!cancellingApprovalId}');
    expect(gcProjectDetail).toContain("order.cost_delta != null ? ` · ${formatSignedCadCents(order.cost_delta)}` : ''");
    expect(gcProjectDetail).not.toContain('formatCad(Math.abs(order.cost_delta))');
  });

  it('routes GC project completion through homeowner approval before closing records', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001400_apply_gc_completion_approval.sql'),
      'utf8',
    );
    const readinessMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260616005234_guard_gc_completion_readiness.sql'),
      'utf8',
    );
    const gcCompletion = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/completion.tsx'),
      'utf8',
    );

    expect(migration).toContain("v_request.metadata->>'action' = 'complete_project'");
    expect(migration).toContain("SET status = 'completed'");
    expect(migration).toContain('public.general_contractor_projects');
    expect(migration).not.toContain('stripe.transfers');
    expect(gcCompletion).toContain('Request Homeowner Completion Approval');
    expect(gcCompletion).toContain('id, status, homeowner_id, general_contractor_id, project_type');
    expect(gcCompletion).toContain('formatGcProjectType(assignment?.project_type, project.room_type)');
    expect(gcCompletion).toContain("metadata: { action: 'complete_project' }");
    expect(gcCompletion).toContain('This does not release escrow funds.');
    expect(readinessMigration).toContain('CREATE OR REPLACE FUNCTION public.guard_gc_completion_approval_ready()');
    expect(readinessMigration).toContain("NEW.metadata->>'action' = 'complete_project'");
    expect(readinessMigration).toContain('request.id <> NEW.id');
    expect(readinessMigration).toContain("request.status = 'pending'");
    expect(readinessMigration).toContain('FROM public.gc_payment_requests payment');
    expect(readinessMigration).toContain("payment.status = 'pending'");
    expect(readinessMigration).toContain('FROM public.change_orders change_order');
    expect(readinessMigration).toContain("change_order.status = 'proposed'");
    expect(readinessMigration).toContain('change_order.signed_by_company IS TRUE');
    expect(readinessMigration).toContain('change_order.signed_by_homeowner IS NOT TRUE');
    expect(readinessMigration).toContain('guard_gc_completion_approval_ready_trigger');
  });

  it('notifies homeowners and GCs about GC workflow actions', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001500_add_gc_workflow_notifications.sql'),
      'utf8',
    );
    const assignmentMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615003100_notify_gc_assignment_lifecycle.sql'),
      'utf8',
    );

    expect(migration).toContain('gc_approval_requested');
    expect(migration).toContain('gc_approval_responded');
    expect(migration).toContain('gc_payment_requested');
    expect(migration).toContain('gc_payment_responded');
    expect(migration).toContain('gc_concierge_booking_requested');
    expect(migration).toContain('gc_concierge_booking_responded');
    expect(migration).toContain('AFTER INSERT ON public.project_approval_requests');
    expect(migration).toContain('AFTER UPDATE OF status ON public.project_approval_requests');
    expect(migration).toContain('AFTER INSERT ON public.gc_payment_requests');
    expect(migration).toContain('AFTER UPDATE OF status ON public.gc_payment_requests');
    expect(migration).toContain('AFTER INSERT ON public.gc_concierge_bookings');
    expect(migration).toContain('AFTER UPDATE OF status ON public.gc_concierge_bookings');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.insert_gc_workflow_notification');
    expect(assignmentMigration).toContain('gc_management_invite_received');
    expect(assignmentMigration).toContain('gc_management_confirmed');
    expect(assignmentMigration).toContain('AFTER INSERT ON public.general_contractor_projects');
    expect(assignmentMigration).toContain('AFTER UPDATE OF status ON public.general_contractor_projects');
    expect(assignmentMigration).toContain('COALESCE(NEW.initiated_by_gc, FALSE) IS FALSE');
    expect(assignmentMigration).toContain("NEW.status = 'active'");
  });

  it('adds GC-to-trade quote negotiation without mutating homeowner quote totals directly', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001600_add_gc_trade_negotiations.sql'),
      'utf8',
    );
    const gcTrades = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/project/[id]/trades.tsx'),
      'utf8',
    );
    const companyJob = fs.readFileSync(
      path.join(repoRoot, 'src/app/(company)/job/[id]/index.tsx'),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.gc_trade_quote_negotiations');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.respond_to_gc_trade_quote_negotiation');
    expect(migration).toContain('gc_trade_negotiation_requested');
    expect(migration).toContain('gc_trade_negotiation_responded');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.respond_to_gc_trade_quote_negotiation');
    expect(migration).not.toContain('UPDATE public.quotes');
    expect(gcTrades).toContain("from('gc_trade_quote_negotiations').insert");
    expect(gcTrades).toContain('handleCancelNegotiation');
    expect(gcTrades).toContain("status: 'cancelled'");
    expect(gcTrades).toContain('cancelled_at: new Date().toISOString()');
    expect(gcTrades).toContain(".eq('general_contractor_id', assignment.general_contractor_id)");
    expect(gcTrades).toContain(".eq('status', 'pending')");
    expect(gcTrades).toContain('It does not change the homeowner-facing quote.');
    expect(gcTrades).toContain('disabled={!!cancellingNegotiationId}');
    expect(gcTrades).toContain('Counteroffer / revision request');
    expect(companyJob).toContain("from('gc_trade_quote_negotiations')");
    expect(companyJob).toContain('general_contractors(business_name, verified)');
    expect(companyJob).toContain("supabase.rpc('respond_to_gc_trade_quote_negotiation'");
    expect(companyJob).toContain('GC quote negotiation');
    expect(companyJob).toContain("status === 'accepted' && !gcVerified");
    expect(companyJob).toContain('Active verified GC management is required before a counteroffer can be accepted.');
    expect(companyJob).toContain('disabled={!gcVerified || !!respondingNegotiationId}');
    expect(companyJob).toContain('Counteroffer accepted');
    expect(companyJob).toContain('Build Updated Quote');
    expect(companyJob).toContain('accepted_counteroffer_cents');
    expect(companyJob).toContain('gc_negotiation_note');
    expect(companyJob).toContain("navigation.navigate('QuoteBuilder', quoteParams)");
  });

  it('collects accepted GC concierge booking payments through Stripe PaymentSheet', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001700_add_gc_concierge_payment_fields.sql'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );

    expect(migration).toContain('payment_status');
    expect(migration).toContain('stripe_payment_intent_id');
    expect(migration).toContain('paid_at');
    expect(homeownerConcierge).toContain("supabase.functions.invoke('create-gc-concierge-payment-intent'");
    expect(homeownerConcierge).toContain('initPaymentSheet');
    expect(homeownerConcierge).toContain('presentPaymentSheet');
    expect(homeownerConcierge).toContain('Pay Booking');
    expect(homeownerConcierge).not.toContain('payment collection is still handled separately');
  });

  it('locks stale GC concierge booking payment and payout actions when GC eligibility changes', () => {
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );
    const paymentFunction = fs.readFileSync(
      path.join(repoRoot, 'supabase/functions/create-gc-concierge-payment-intent/index.ts'),
      'utf8',
    );
    const payoutFunction = fs.readFileSync(
      path.join(repoRoot, 'supabase/functions/gc-concierge-payout/index.ts'),
      'utf8',
    );

    expect(homeownerConcierge).toContain('function getBookingGc(row: ConciergeBookingWithGc)');
    expect(homeownerConcierge).toContain('function isBookingGcConciergeEligible(row: ConciergeBookingWithGc)');
    expect(homeownerConcierge).toContain('general_contractor:general_contractors ( id, business_name, concierge_enabled, verified )');
    expect(homeownerConcierge).toContain('bookingRequests.length > 0 ? renderConciergeBookingsSection() : null');
    expect(homeownerConcierge).toContain("Alert.alert('Payment locked'");
    expect(homeownerConcierge).toContain("Alert.alert('Payout locked'");
    expect(homeownerConcierge).toContain('WalkerAI verification and concierge marketplace access are required before this concierge booking can be paid.');
    expect(homeownerConcierge).toContain('WalkerAI verification and concierge marketplace access are required before this concierge payout can be released.');
    expect(homeownerConcierge).toContain('disabled={!bookingGcEligible || !!payingBookingId}');
    expect(homeownerConcierge).toContain('disabled={!bookingGcEligible || !!releasingBookingId}');
    expect(homeownerConcierge).toContain('GC: {bookingGc.business_name}');
    expect(homeownerConcierge).toContain('if (!isBookingGcConciergeEligible(booking))');
    expect(paymentFunction).toContain('gc.verified !== true || gc.concierge_enabled !== true');
    expect(paymentFunction).toContain('Concierge booking is no longer available for payment');
    expect(payoutFunction).toContain('gc.verified !== true || gc.concierge_enabled !== true');
    expect(payoutFunction).toContain('General contractor is no longer eligible for concierge payouts');
  });

  it('adds GC Stripe Connect setup for concierge payouts', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001800_add_gc_stripe_connect_fields.sql'),
      'utf8',
    );
    const gcProfile = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/profile.tsx'),
      'utf8',
    );

    expect(migration).toContain('ALTER TABLE public.general_contractors');
    expect(migration).toContain('stripe_account_id');
    expect(migration).toContain('stripe_transfers_active');
    expect(gcProfile).toContain("supabase.functions.invoke('create-connect-account'");
    expect(gcProfile).toContain("role: 'general_contractor'");
    expect(gcProfile).toContain('Edit Business Info');
    expect(gcProfile).toContain("navigation.navigate('GeneralContractorBusinessOnboarding', { returnToProfile: true })");
    expect(gcProfile).toContain('Set Up Payouts');
    expect(gcProfile).toContain('isStripePayoutLocallyReady(gc)');
  });

  it('releases paid GC concierge booking payouts only after homeowner completion confirmation', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001900_add_gc_concierge_payout_tracking.sql'),
      'utf8',
    );
    const homeownerConcierge = fs.readFileSync(
      path.join(repoRoot, 'src/app/(homeowner)/project/[id]/concierge.tsx'),
      'utf8',
    );
    const gcApprovals = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/approvals.tsx'),
      'utf8',
    );

    expect(migration).toContain('stripe_transfer_id');
    expect(migration).toContain('payout_released_at');
    expect(homeownerConcierge).toContain("supabase.functions.invoke('gc-concierge-payout'");
    expect(homeownerConcierge).toContain('Confirm Complete & Release Payout');
    expect(homeownerConcierge).toContain("booking.payment_status !== 'paid'");
    expect(gcApprovals).toContain('Waiting for homeowner completion confirmation');
    expect(gcApprovals).toContain('Payout released');
  });
});
