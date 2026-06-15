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
    expect(nextGeneralContractorOnboardingRoute({ license_number: null, insurance_doc_url: null })).toBe('GeneralContractorLicenseOnboarding');
    expect(nextGeneralContractorOnboardingRoute({ license_number: 'GC-123', insurance_doc_url: null })).toBe('GeneralContractorInsuranceOnboarding');
    expect(isGeneralContractorSetupComplete({ license_number: 'GC-123', insurance_doc_url: 'https://example.com/insurance.pdf' })).toBe(true);
    expect(businessOnboarding).toContain("from('general_contractors')");
    expect(businessOnboarding).toContain('business_name, address, city, province, postal_code, service_radius_km');
    expect(businessOnboarding).toContain('setBusinessName(data.business_name');
    expect(businessOnboarding).toContain('setDefaultMarkup(data.default_markup_pct');
    expect(businessOnboarding).toContain('existing?.id');
    expect(businessOnboarding).toContain('returnToProfile');
    expect(businessOnboarding).toContain("navigation.navigate('GeneralContractorTabs', { screen: 'GeneralContractorProfile' })");
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
    const contactMigration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002300_add_gc_project_client_contact.sql'),
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
    expect(dashboard).toContain('homeowner_contact_name, homeowner_contact_email, homeowner_contact_phone');
    expect(dashboard).toContain('projectContact');
    expect(createProject).toContain("supabase.rpc('create_gc_managed_project'");
    expect(createProject).toContain('Homeowner name');
    expect(createProject).toContain('Homeowner phone');
    expect(createProject).toContain('homeowner_contact_name: contactName');
    expect(createProject).toContain('homeowner_contact_phone: contactPhone || null');
    expect(homeownerConcierge).toContain('Confirm GC Management');
    expect(gcProjectDetail).toContain('homeowner_contact_name, homeowner_contact_email, homeowner_contact_phone');
    expect(gcProjectDetail).toContain('Homeowner contact');
    expect(gcProjectDetail).toContain('Waiting for the homeowner to confirm GC management');
    expect(contactMigration).toContain('ADD COLUMN IF NOT EXISTS homeowner_contact_name');
    expect(contactMigration).toContain('ADD COLUMN IF NOT EXISTS homeowner_contact_email');
    expect(contactMigration).toContain('ADD COLUMN IF NOT EXISTS homeowner_contact_phone');
    expect(contactMigration).toContain('populate_gc_project_homeowner_contact');
  });

  it('counts real GC homeowner actions on the dashboard approval metric', () => {
    const dashboard = fs.readFileSync(
      path.join(repoRoot, 'src/app/(general-contractor)/index.tsx'),
      'utf8',
    );

    expect(dashboard).toContain("from('project_approval_requests')");
    expect(dashboard).toContain("from('gc_payment_requests')");
    expect(dashboard).toContain("from('gc_concierge_bookings')");
    expect(dashboard).toContain("eq('requested_by_gc_id', profile.id)");
    expect(dashboard).toContain("eq('general_contractor_id', profile.id)");
    expect(dashboard).toContain("eq('payment_status', 'paid')");
    expect(dashboard).toContain("is('payout_released_at', null)");
    expect(dashboard).not.toContain("from('change_orders')");
  });

  it('surfaces the GC markup engine on managed project detail', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002200_apply_gc_terms_approval.sql'),
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
    expect(gcProjectDetail).toContain('Send Terms for Approval');
    expect(gcProjectDetail).toContain("action: 'update_gc_terms'");
    expect(gcProjectDetail).toContain("from('project_approval_requests').insert");
    expect(migration).toContain("v_request.metadata->>'action' = 'update_gc_terms'");
    expect(migration).toContain('markup_pct = v_markup_pct');
    expect(migration).toContain('concierge_fee_pct = v_concierge_fee_pct');
    expect(migration).toContain("AND status = 'active'");
  });

  it('supports externally managed trades without treating them as WalkerAI verified', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615000500_add_external_trade_management.sql'),
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

    expect(migration).toContain("fulfillment_type IN ('walker_ai', 'external')");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.mark_project_slot_externally_managed');
    expect(migration).toContain('Active GC management is required before marking external trades');
    expect(migration).toContain("status = 'filled'");
    expect(gcProjectDetail).toContain("supabase.rpc('mark_project_slot_externally_managed'");
    expect(gcProjectDetail).toContain('Mark externally managed');
    expect(gcProjectDetail).toContain('No escrow protection');
    expect(homeownerProject).toContain('Externally managed by GC');
    expect(homeownerProject).toContain('No escrow protection');
  });

  it('stores external trade documents without paid WalkerAI verification', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615002100_add_external_trade_documents.sql'),
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
    expect(gcProjectDetail).toContain("uploadFile('company-docs'");
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
    expect(navigator).toContain('GeneralContractorPermits');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorPermits'");
    expect(gcPermits).toContain("from('permits').insert");
    expect(gcPermits).toContain('Upload Document');
    expect(gcPermits).toContain('inspection_scheduled');
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
    expect(gcPayments).toContain("from('gc_payment_requests').insert");
    expect(gcPayments).toContain('Funds are still released through existing escrow milestones');
    expect(gcApprovals).toContain("from('gc_payment_requests')");
    expect(gcApprovals).toContain('Payment requests');
    expect(gcApprovals).toContain("navigation.navigate('GeneralContractorPayments'");
    expect(gcApprovals).toContain('Escrow release still happens through milestones');
    expect(homeownerConcierge).toContain("from('gc_payment_requests')");
    expect(homeownerConcierge).toContain("supabase.rpc('respond_to_gc_payment_request'");
    expect(homeownerConcierge).toContain('Approving this records your authorization. It does not bypass milestone escrow release.');
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
    expect(gcMaterials).toContain('Send Material Recommendation');
    expect(gcMaterials).toContain('Homeowner approval is required before the material preference changes.');
    expect(homeownerConcierge).toContain('Material substitutions approved here update the project material preference fields.');
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
    expect(gcDiscovery).toContain("from('project_approval_requests').insert");
    expect(gcDiscovery).toContain("request_type: requestType");
    expect(gcDiscovery).toContain("value: 'change_order'");
    expect(gcDiscovery).toContain('No discovery or scope change becomes active until the homeowner approves it.');
    expect(gcDiscovery).not.toContain("from('change_orders').insert");
  });

  it('lets GCs participate in the project communication thread', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001000_allow_gc_project_messages.sql'),
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

    expect(migration).toContain('messages_project_participants');
    expect(migration).toContain('general_contractor_projects gcp');
    expect(migration).toContain("gcp.status IN ('invited', 'active', 'completed')");
    expect(navigator).toContain('GeneralContractorMessages');
    expect(gcProjectDetail).toContain("navigation.navigate('GeneralContractorMessages'");
    expect(gcMessages).toContain("from('messages').insert");
    expect(gcMessages).toContain("channel(`gc-messages:${projectId}`)");
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
    expect(gcCompletion).toContain("from('gc_payment_requests')");
    expect(gcCompletion).toContain('Digital project binder');
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
    expect(gcAssistant).toContain("from('project_slots')");
    expect(gcAssistant).toContain("from('permits')");
    expect(gcAssistant).toContain("from('project_approval_requests')");
    expect(gcAssistant).toContain("from('gc_payment_requests')");
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
    expect(gcApprovals).toContain('Homeowner approval requests');
    expect(gcApprovals).toContain("navigation.navigate('GeneralContractorProjectDetail'");
  });

  it('routes GC project completion through homeowner approval before closing records', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001400_apply_gc_completion_approval.sql'),
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
    expect(gcCompletion).toContain("metadata: { action: 'complete_project' }");
    expect(gcCompletion).toContain('This does not release escrow funds.');
  });

  it('notifies homeowners and GCs about GC workflow actions', () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, 'supabase/migrations/20260615001500_add_gc_workflow_notifications.sql'),
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
    expect(gcTrades).toContain('Counteroffer / revision request');
    expect(companyJob).toContain("from('gc_trade_quote_negotiations')");
    expect(companyJob).toContain("supabase.rpc('respond_to_gc_trade_quote_negotiation'");
    expect(companyJob).toContain('GC quote negotiation');
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
