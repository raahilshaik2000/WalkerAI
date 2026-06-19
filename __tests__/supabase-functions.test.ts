import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '../src/lib/supabase/functions';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('Supabase function error formatting', () => {
  it('uses JSON edge function error bodies when available', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'Quote is not pending approval' })),
    };

    await expect(formatSupabaseFunctionError(error)).resolves.toBe('Quote is not pending approval');
  });

  it('uses alternate Supabase edge function message fields', async () => {
    const error = {
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ code: 404, msg: 'Function not found' })),
    };

    await expect(formatSupabaseFunctionError(error)).resolves.toBe('Function not found');
  });

  it('falls back to polished copy for transient infrastructure errors', async () => {
    await expect(formatSupabaseFunctionError(new Error('Network request failed'))).resolves.toBe('Request failed. Please try again.');
    await expect(formatSupabaseFunctionError({
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'The connection to the database timed out' })),
    }, 'Analysis failed. Please try again.')).resolves.toBe('Analysis failed. Please try again.');
    expect(formatAppSafeErrorMessage(new Error('The connection to the database timed out'), 'Could not load notifications.')).toBe(
      'Could not load notifications.',
    );
  });

  it('falls back to polished copy for database-internal errors', async () => {
    expect(formatAppSafeErrorMessage(
      new Error('new row violates row-level security policy for table "project_photos"'),
      'Upload failed. Please try again.',
    )).toBe('Upload failed. Please try again.');
    expect(formatAppSafeErrorMessage(
      { message: 'column general_contractor_projects.markup_percent does not exist' },
      'Could not load project management context.',
    )).toBe('Could not load project management context.');
    await expect(formatSupabaseFunctionError({
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'duplicate key value violates unique constraint "notifications_pkey"' })),
    }, 'Request failed. Please try again.')).resolves.toBe('Request failed. Please try again.');
  });

  it('normalizes legacy GC financial term errors before app display', async () => {
    await expect(formatSupabaseFunctionError({
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'Markup must be between 0 and 50 percent' })),
    })).resolves.toBe('Management allowance must be between 0% and 50%.');

    await expect(formatSupabaseFunctionError(new Error('Concierge fee must be between 0 and 25 percent'))).resolves.toBe(
      'Concierge allowance must be between 0% and 25%.',
    );
  });

  it('normalizes direct RPC error messages before app display', () => {
    expect(formatAppSafeErrorMessage(new Error('Markup must be between 0 and 50 percent'))).toBe(
      'Management allowance must be between 0% and 50%.',
    );
    expect(formatAppSafeErrorMessage({ message: 'Concierge fee must be between 0 and 25 percent' })).toBe(
      'Concierge allowance must be between 0% and 25%.',
    );
    expect(formatAppSafeErrorMessage(new Error('GC markup approval request is missing a valid markup percentage'))).toBe(
      'Management allowance approval request is missing a valid percentage.',
    );
    expect(formatAppSafeErrorMessage(new Error('GC terms approval request is missing a valid concierge fee percentage'))).toBe(
      'Concierge allowance approval request is missing a valid percentage.',
    );
    expect(formatAppSafeErrorMessage(new Error('No homeowner account found for that email'))).toBe(
      'Enter the email for an existing WalkerAI homeowner account before creating a managed project.',
    );
    expect(formatAppSafeErrorMessage(null, 'Fallback copy')).toBe('Fallback copy');
  });
});

describe('generate-material-orders source guards', () => {
  it('filters out zero-quantity materials before supplier order creation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-material-orders/index.ts'),
      'utf8',
    );

    expect(source).toContain('function effectiveMaterialQuantity');
    expect(source).toContain('const orderableMaterials = (materials ?? []).filter');
    expect(source).toContain('effectiveMaterialQuantity(material) > 0');
    expect(source).toContain('const orderInserts = orderableMaterials.map');
  });

  it('allows assigned contractors to repair material order generation for active projects', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-material-orders/index.ts'),
      'utf8',
    );

    expect(source).toContain('async function userCompanyId');
    expect(source).toContain('async function companyParticipatesInProject');
    expect(source).toContain("assigned_company_id");
    expect(source).toContain(".from('project_slots')");
    expect(source).toContain("isAssignedContractor");
    expect(source).toContain("project.status !== 'active'");
  });

  it('allows active verified GC managers to repair material order generation for managed projects', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-material-orders/index.ts'),
      'utf8',
    );

    expect(source).toContain('async function userGeneralContractorId');
    expect(source).toContain('async function generalContractorManagesProject');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain('general_contractors!inner');
    expect(source).toContain(".eq('status', 'active')");
    expect(source).toContain(".eq('general_contractors.verified', true)");
    expect(source).toContain("appUser?.role === 'general_contractor'");
    expect(source).toContain('isActiveGcManager');
  });
});

describe('QA account seed source guards', () => {
  it('allows create-test-user to create verified company, supplier, and GC profiles', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/create-test-user/index.ts'),
      'utf8',
    );

    expect(source).toContain("'general_contractor'");
    expect(source).toContain("body.role === 'general_contractor'");
    expect(source).toContain("body.role === 'company'");
    expect(source).toContain("body.role === 'supplier'");
    expect(source).toContain(".from('companies').upsert");
    expect(source).toContain(".from('suppliers').upsert");
    expect(source).toContain(".from('general_contractors').upsert");
    expect(source).toContain("'painter'");
    expect(source).toContain("'flooring_installer'");
    expect(source).toContain("'drywall'");
    expect(source).toContain("'demolition'");
    expect(source).toContain("primary_trade: 'plumber'");
    expect(source).toContain('verified: true');
    expect(source).toContain('concierge_enabled: true');
    expect(source).toContain("stripe_account_id: 'acct_qa_company_test'");
    expect(source).toContain("stripe_account_id: 'acct_qa_supplier_test'");
    expect(source).toContain("stripe_account_id: 'acct_qa_gc_test'");
    expect(source).toContain('stripe_payouts_enabled: true');
    expect(source).toContain("if (role === 'company') return 'verified_company'");
    expect(source).toContain("if (role === 'supplier') return 'verified_supplier'");
    expect(source).toContain("if (role === 'general_contractor') return 'verified_general_contractor'");
  });

  it('seeds all four QA accounts using current profile columns', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/seed-qa/index.ts'),
      'utf8',
    );

    expect(source).toContain('gc_email');
    expect(source).toContain("ensureUser(supabase, body.gc_email, body.gc_password, 'general_contractor')");
    expect(source).toContain(".from('general_contractors').upsert");
    expect(source).toContain("general_contractor: { id: generalContractor.id, email: body.gc_email }");
    expect(source).toContain('concierge_enabled: true');
    expect(source).toContain("stripe_account_id: 'acct_qa_gc_test'");
    expect(source).toContain('stripe_details_submitted: true');
    expect(source).toContain('stripe_payouts_enabled: true');
    expect(source).toContain('stripe_transfers_active: true');
    expect(source).toContain('verified: true');
    expect(source).toContain("'painter'");
    expect(source).toContain("'flooring_installer'");
    expect(source).toContain("'drywall'");
    expect(source).toContain("'demolition'");
    expect(source).toContain("primary_trade: 'plumber'");
    expect(source).toContain('Company is configured as a verified multi-trade contractor');
    expect(source).toContain('lat: 43.6532');
    expect(source).toContain('lng: -79.3832');
    expect(source).not.toContain("trade_types: ['general_contractor']");
    expect(source).not.toContain("primary_trade: 'general_contractor'");
    expect(source).not.toContain('Company is configured as general_contractor');
    expect(source).not.toContain('is_verified');
    expect(source).not.toContain('latitude:');
    expect(source).not.toContain('longitude:');
    expect(source).not.toContain('stripe_onboarding_completed');
  });
});

describe('accept-job source guards', () => {
  it('uses the same 30/40/30 standard milestone split as company quote builder auto-split', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/accept-job/index.ts'),
      'utf8',
    );

    expect(source).toContain('const deposit    = Math.round(avgCost * 0.30);');
    expect(source).toContain('const midpoint   = Math.round(avgCost * 0.40);');
    expect(source).toContain('const completion = avgCost - deposit - midpoint;');
    expect(source).not.toContain('const midpoint   = Math.round(avgCost * 0.30);');
    expect(source).toMatch(/Project Deposit[\s\S]*Mid-Project[\s\S]*Final Completion/);
  });
});

describe('create-connect-account source guards', () => {
  it('supports Stripe Connect onboarding for GC payout accounts', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/create-connect-account/index.ts'),
      'utf8',
    );

    expect(source).toContain("body?.role === 'general_contractor'");
    expect(source).toContain("'general_contractors'");
    expect(source).toContain("'general_contractor_id'");
    expect(source).toContain(".from('users')");
    expect(source).toContain(".select('role')");
    expect(source).toContain('appUser.role !== requestedRole');
    expect(source).toContain('Account role does not match payout setup request');
    expect(source).toContain('hasCompleteGcPayoutProfile');
    expect(source).toContain('business_name, city, province, lat, lng');
    expect(source).toContain('license_number, license_doc_url, insurance_doc_url');
    expect(source).toContain('Complete your GC business, location, license, and insurance setup before connecting payouts');
    expect(source).toContain('role: requestedRole');
    expect(source).toContain('/schema cache/i.test(message)');
    expect(source).toContain("function publicFunctionUrl(slug: string, query = '')");
    expect(source).toContain("refresh_url: publicFunctionUrl('stripe-return', '?refresh=1')");
    expect(source).toContain("return_url: publicFunctionUrl('stripe-return')");
    expect(source).not.toContain("https://walkerai.app/stripe-refresh");
    expect(source).not.toContain("https://walkerai.app/stripe-return");
  });
});

describe('stripe-return source guards', () => {
  it('serves a public text-only return and refresh target for Stripe Connect onboarding', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/stripe-return/index.ts'),
      'utf8',
    );

    expect(source).toContain('Deploy with --no-verify-jwt');
    expect(source).toContain('Content-Type');
    expect(source).toContain('text/plain; charset=utf-8');
    expect(source).toContain("url.searchParams.get('refresh') === '1'");
    expect(source).toContain('Your setup link expired.');
    expect(source).toContain("You're all set.");
  });
});

describe('refresh-connect-status source guards', () => {
  it('syncs Stripe readiness for company, supplier, and GC payout accounts', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/refresh-connect-status/index.ts'),
      'utf8',
    );

    expect(source).toContain("table: 'companies' | 'suppliers' | 'general_contractors'");
    expect(source).toContain("let requestedRole: 'company' | 'supplier' | 'general_contractor' = 'company';");
    expect(source).toContain("body?.role === 'general_contractor'");
    expect(source).toContain("'general_contractors'");
    expect(source).toContain("'General contractor'");
    expect(source).toContain(".from('users')");
    expect(source).toContain(".select('role')");
    expect(source).toContain('appUser.role !== requestedRole');
    expect(source).toContain('Account role does not match payout status refresh request');
    expect(source).toContain("JSON.stringify({ error: `${roleLabel} not found` })");
    expect(source).toContain('stripe.accounts.retrieve(accountId)');
    expect(source).toContain('await updateStripeReadiness(adminClient, table, accountOwner.id, readiness)');
  });
});

describe('Stripe payout readiness guards', () => {
  it('keeps Stripe readiness fields service-role maintained across account tables', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260615003300_guard_stripe_readiness_updates.sql'),
      'utf8',
    );

    expect(source).toContain('CREATE OR REPLACE FUNCTION public.guard_stripe_readiness_fields()');
    expect(source).toContain("(SELECT auth.role()) = 'service_role'");
    expect(source).toContain('NEW.stripe_account_id IS NOT NULL');
    expect(source).toContain('NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id');
    expect(source).toContain('NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted');
    expect(source).toContain('NEW.stripe_payouts_enabled IS DISTINCT FROM OLD.stripe_payouts_enabled');
    expect(source).toContain('NEW.stripe_transfers_active IS DISTINCT FROM OLD.stripe_transfers_active');
    expect(source).toContain('guard_company_stripe_readiness_fields');
    expect(source).toContain('guard_supplier_stripe_readiness_fields');
    expect(source).toContain('guard_gc_stripe_readiness_fields');
    expect(source).toContain('Stripe payout readiness is maintained by WalkerAI backend services');
  });
});

describe('company material verification source guards', () => {
  it('tries to generate supplier orders after contractor quantity verification', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/materials.tsx'),
      'utf8',
    );

    expect(source).toContain("supabase.functions.invoke('generate-material-orders'");
    expect(source).toContain('materialOrderGenerationMessage');
    expect(source).toContain('Supplier orders will be generated after the homeowner funds the approved quote.');
    expect(source).toContain('orders_created');
  });
});

describe('generate-project-brief source guards', () => {
  it('normalizes forced budget overrides before persisting project costs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-project-brief/index.ts'),
      'utf8',
    );

    expect(source).toContain('const POSTGRES_INTEGER_MAX = 2147483647;');
    expect(source).toContain("function normalizeForcedCostCents(value: unknown, fieldName: 'forced_cost_min' | 'forced_cost_max')");
    expect(source).toContain('Number.isInteger(value)');
    expect(source).toContain('throw new Error(`${fieldName} must be a positive integer CAD-cent amount`);');
    expect(source).toContain('throw new Error(`${fieldName} exceeds the supported project budget limit`);');
    expect(source).toContain('function normalizeForcedBudget');
    expect(source).toContain('Both forced_cost_min and forced_cost_max are required when overriding the project budget');
    expect(source).toContain('forced_cost_max must be greater than or equal to forced_cost_min');
    expect(source).toContain('const { forcedCostMin, forcedCostMax } = normalizeForcedBudget(forced_cost_min, forced_cost_max);');
    expect(source).toContain('forcedCostMin,');
    expect(source).toContain('forcedCostMax,');
    expect(source).toContain('if (forcedCostMin !== undefined) brief.ai_cost_min = forcedCostMin;');
    expect(source).toContain('if (forcedCostMax !== undefined) brief.ai_cost_max = forcedCostMax;');
    expect(source).not.toContain('if (forced_cost_min !== undefined) brief.ai_cost_min = forced_cost_min;');
    expect(source).not.toContain('if (forced_cost_max !== undefined) brief.ai_cost_max = forced_cost_max;');
  });

  it('allows active GC managers to generate project briefs without making them project owners', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-project-brief/index.ts'),
      'utf8',
    );

    expect(source).toContain('isActiveGeneralContractorForProject');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain(".eq('status', 'active')");
    expect(source).toContain(".eq('general_contractors.user_id', userId)");
    expect(source).toContain(".eq('general_contractors.verified', true)");
    expect(source).toContain('hasCompleteGcWorkflowProfile');
    expect(source).toContain('license_number, license_doc_url, insurance_doc_url');
    expect(source).toContain(".from('users')");
    expect(source).toContain("appUser?.role === 'general_contractor'");
    expect(source).toContain('const requesterIsHomeowner = project.homeowner_id === user.id;');
    expect(source).toContain('if (!requesterIsHomeowner && !requesterIsActiveGc)');
    expect(source).toContain("JSON.stringify({ error: 'Forbidden' })");
  });

  it('uses GC project type when generating non-kitchen managed project briefs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-project-brief/index.ts'),
      'utf8',
    );

    expect(source).toContain("const PROJECT_TYPES = ['kitchen', 'bathroom', 'flooring', 'painting', 'basement', 'addition', 'other'] as const;");
    expect(source).toContain('function gcProjectTypeForProject');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain(".select('project_type')");
    expect(source).toContain("const gcProjectType = await gcProjectTypeForProject(adminClient, project_id);");
    expect(source).toContain("const projectType = gcProjectType ?? (isProjectType(project.room_type) ? project.room_type : 'kitchen');");
    expect(source).toContain('projectCostRange(provinceCode, projectType)');
    expect(source).toContain('Generate a detailed renovation project brief for a ${formatProjectType(projectType)} project');
    expect(source).toContain('projectType,');
    expect(source).toContain("projectType === 'flooring'");
    expect(source).toContain('Flooring material package');
    expect(source).toContain("projectType === 'painting'");
    expect(source).toContain('Paint, primer, and sundries');
    expect(source).toContain("projectType === 'basement'");
    expect(source).toContain('Basement framing and drywall materials');
    expect(source).toContain("projectType === 'addition'");
    expect(source).toContain('Framing, sheathing, and structural materials');
    expect(source).not.toContain("const roomType = project.room_type ?? 'kitchen';");
  });
});

describe('generate-trade-slots source guards', () => {
  it('clears stale dispatch logs before regenerating project slots', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-trade-slots/index.ts'),
      'utf8',
    );

    expect(source).toContain(".from('dispatch_logs').delete().eq('project_id', project_id)");
    expect(source).toContain(".from('project_slots').delete().eq('project_id', project_id)");
    expect(source).toMatch(
      /\.from\('dispatch_logs'\)\.delete\(\)\.eq\('project_id', project_id\)[\s\S]*?\.from\('project_slots'\)\.delete\(\)\.eq\('project_id', project_id\)/
    );
  });

  it('allows active GC managers to generate trade slots without making them project owners', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-trade-slots/index.ts'),
      'utf8',
    );

    expect(source).toContain('isActiveGeneralContractorForProject');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain(".eq('status', 'active')");
    expect(source).toContain(".eq('general_contractors.user_id', userId)");
    expect(source).toContain(".eq('general_contractors.verified', true)");
    expect(source).toContain('hasCompleteGcWorkflowProfile');
    expect(source).toContain('license_number, license_doc_url, insurance_doc_url');
    expect(source).toContain(".from('users')");
    expect(source).toContain("appUser?.role === 'general_contractor'");
    expect(source).toContain('const requesterIsHomeowner = project.homeowner_id === requesterId;');
    expect(source).toContain('if (!requesterIsHomeowner && !requesterIsActiveGc)');
  });

  it('uses GC project type for non-kitchen trade slot generation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-trade-slots/index.ts'),
      'utf8',
    );

    expect(source).toContain("const VALID_TRADES = [\n  'plumber'");
    expect(source).toContain('function fallbackTradeSlots');
    expect(source).toContain(".select('project_type')");
    expect(source).toContain('deterministicSlotsForGcProjectType(gcProjectType, totalMin, totalMax)');
    expect(source).toContain("projectType === 'flooring'");
    expect(source).toContain("trade_type: 'flooring_installer'");
    expect(source).toContain("projectType === 'painting'");
    expect(source).toContain("trade_type: 'painter'");
    expect(source).toContain("projectType === 'basement'");
    expect(source).toContain("projectType === 'addition'");
    expect(source).toContain('Project type: ${formatProjectType(projectType)}');
    expect(source).not.toContain("trade_type: 'general_contractor'");
    expect(source).not.toContain("'general_contractor', 'plumber'");
    expect(source).not.toContain('Room type: ${project.room_type}');
    expect(source).not.toContain('Full ${project.room_type} renovation');
  });
});

describe('dispatch-slots source guards', () => {
  it('allows draft, brief-ready, or already-dispatching projects only after a generated budget exists', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/dispatch-slots/index.ts'),
      'utf8',
    );

    expect(source).toContain('city, province, status, ai_cost_min, ai_cost_max');
    expect(source).toContain("if (!['draft', 'brief_ready', 'dispatching'].includes(project.status))");
    expect(source).toContain('Project must have a generated brief before contractor dispatch can start');
    expect(source).toMatch(
      /Project must have a generated brief before contractor dispatch can start[\s\S]*?if \(project\.lat == null \|\| project\.lng == null\)/
    );
    expect(source).toMatch(
      /Project must have a generated brief before contractor dispatch can start[\s\S]*?\.from\('dispatch_logs'\)\.insert\(logs\)/
    );
  });

  it('requires a valid project budget before contractor dispatch', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/dispatch-slots/index.ts'),
      'utf8',
    );

    expect(source).toContain('const totalMin = project.ai_cost_min ?? 0;');
    expect(source).toContain('const totalMax = project.ai_cost_max ?? 0;');
    expect(source).toContain('totalMax < totalMin');
    expect(source).toContain('Project budget is missing. Generate the project brief before dispatching.');
    expect(source).toMatch(
      /Project budget is missing\. Generate the project brief before dispatching\.[\s\S]*?if \(project\.lat == null \|\| project\.lng == null\)/
    );
    expect(source).toMatch(
      /Project budget is missing\. Generate the project brief before dispatching\.[\s\S]*?\.from\('dispatch_logs'\)\.insert\(logs\)/
    );
  });

  it('allows active GC managers to dispatch open trade slots without owning the project', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/dispatch-slots/index.ts'),
      'utf8',
    );

    expect(source).toContain('isActiveGeneralContractorForProject');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain(".eq('status', 'active')");
    expect(source).toContain(".eq('general_contractors.user_id', userId)");
    expect(source).toContain(".eq('general_contractors.verified', true)");
    expect(source).toContain('hasCompleteGcWorkflowProfile');
    expect(source).toContain('license_number, license_doc_url, insurance_doc_url');
    expect(source).toContain(".from('users')");
    expect(source).toContain("appUser?.role === 'general_contractor'");
    expect(source).toContain('const requesterIsHomeowner = project.homeowner_id === requesterId;');
    expect(source).toContain('if (!requesterIsHomeowner && !requesterIsActiveGc)');
  });

  it('does not dispatch specialist trade slots to company GC trade fallbacks', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/dispatch-slots/index.ts'),
      'utf8',
    );

    expect(source).toContain('Dispatch only exact trade matches.');
    expect(source).toContain('the separate general_contractor account type');
    expect(source).not.toContain(".filter('trade_types', 'cs', '{general_contractor}')");
    expect(source).not.toContain('fall back to general contractors');
  });

  it('includes GC project type and slot estimates in trade dispatch notifications', () => {
    const dispatchSlots = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/dispatch-slots/index.ts'),
      'utf8',
    );
    const sendPush = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/send-push/index.ts'),
      'utf8',
    );

    expect(dispatchSlots).toContain("select('project_type')");
    expect(dispatchSlots).toContain('const projectTypeLabel = formatProjectTypeLabel(gcProjectType, project.room_type);');
    expect(dispatchSlots).toContain('project_type: gcProjectType');
    expect(dispatchSlots).toContain('estimated_cost_min: slot.estimated_cost_min');
    expect(dispatchSlots).toContain('estimated_cost_max: slot.estimated_cost_max');
    expect(dispatchSlots).toContain('message: `${projectTypeLabel} ${slot.trade_type.replace(/_/g, ');

    expect(sendPush).toContain('function dispatchEstimateText');
    expect(sendPush).toContain('payload.estimated_cost_min');
    expect(sendPush).toContain('payload.estimated_cost_max');
    expect(sendPush).toContain('projectTypeLabel(payload.project_type, payload.room_type)');
    expect(sendPush).not.toContain("body: `${payload.room_type ?? 'Renovation'}");
  });
});

describe('quote submission status sync migration', () => {
  it('moves homeowner-visible projects into quoting when a pending quote is submitted', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260605001700_sync_project_status_on_quote_submission.sql'),
      'utf8',
    );

    expect(source).toContain('CREATE OR REPLACE FUNCTION public.sync_project_status_on_quote_submission()');
    expect(source).toContain("IF NEW.status = 'pending' THEN");
    expect(source).toContain('UPDATE public.projects project');
    expect(source).toContain("SET status = 'quoting'");
    expect(source).toContain("project.status IN ('accepted', 'scheduling')");
    expect(source).toContain("project.status = 'dispatching'");
    expect(source).toContain('slot.status NOT IN (\'filled\', \'scheduled\')');
    expect(source).toContain('CREATE TRIGGER sync_project_status_on_quote_submission_trigger');
    expect(source).toContain('AFTER INSERT OR UPDATE OF status ON public.quotes');
    expect(source).toContain("WHEN (NEW.status = 'pending')");
    expect(source).toContain('EXECUTE FUNCTION public.sync_project_status_on_quote_submission()');
  });

  it('keeps partially accepted trade-slot projects dispatching after the first quote', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260619033435_keep_partial_trade_projects_dispatching_on_quote.sql'),
      'utf8',
    );

    expect(source).toContain('CREATE OR REPLACE FUNCTION public.sync_project_status_on_quote_submission()');
    expect(source).toContain("project.status = 'dispatching'");
    expect(source).toContain('NOT EXISTS (');
    expect(source).toContain('FROM public.project_slots slot');
    expect(source).toContain('slot.status NOT IN (\'filled\', \'scheduled\')');
  });

  it('submits company quote packages atomically with server-side ownership checks', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260616003336_submit_company_quote_rpc.sql'),
      'utf8',
    );

    expect(source).toContain('CREATE OR REPLACE FUNCTION public.submit_company_quote');
    expect(source).toContain('SECURITY DEFINER');
    expect(source).toContain('SET search_path = public');
    expect(source).toContain('WHERE user_id = v_user_id');
    expect(source).toContain('AND verified = TRUE');
    expect(source).toContain('pg_advisory_xact_lock');
    expect(source).toContain('assigned_company_id = v_company_id');
    expect(source).toContain("ps.status IN ('filled', 'scheduled')");
    expect(source).toContain('q.stripe_payment_intent_id IS NOT NULL');
    expect(source).toContain('DELETE FROM public.quotes q');
    expect(source).toContain('INSERT INTO public.quotes');
    expect(source).toContain('INSERT INTO public.milestones');
    expect(source).toContain('INSERT INTO public.quote_line_items');
    expect(source).toContain('ABS(v_milestone_total - p_total_amount) > 1');
    expect(source).toContain('At least one priced quote line item is required');
    expect(source).toContain('quote_submitted');
    expect(source).toContain('GRANT EXECUTE ON FUNCTION public.submit_company_quote(UUID, UUID, INTEGER, JSONB, JSONB) TO authenticated');
  });
});

describe('stripe-webhook source guards', () => {
  it('does not activate trade-slot projects before schedule confirmation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/stripe-webhook/index.ts'),
      'utf8',
    );

    expect(source).toContain('/schema cache/i.test(message)');
    expect(source).toContain(".select('id, assigned_company_id, status, fulfillment_type')");
    expect(source).toContain("const externalSlotsReady = requiredSlots");
    expect(source).toContain("slot.fulfillment_type === 'external'");
    expect(source).toContain("const quoteRequiredSlots = requiredSlots.filter((slot) => slot.fulfillment_type !== 'external');");
    expect(source).toContain('if (quoteRequiredSlots.length === 0) return true;');
    expect(source).toContain('return quoteRequiredSlots.every((slot) => (');
    expect(source).toContain('async function projectHasTradeSlots');
    expect(source).toContain("await updateStripeReadiness(adminClient, 'general_contractors', account.id, readiness);");
    expect(source).toContain("const scheduleRequired = await projectHasTradeSlots(adminClient, project_id);");
    expect(source).toContain(".select('id, scheduling_status')");
    expect(source).toContain('async function projectScheduleConfirmed');
    expect(source).toContain("const scheduleConfirmed = !scheduleRequired || await projectScheduleConfirmed(adminClient, project_id);");
    expect(source).toContain("const nextProjectState = scheduleConfirmed");
    expect(source).toContain("? { status: 'active' }");
    expect(source).toContain(": { status: 'scheduling', scheduling_status: 'pending_homeowner' };");
    expect(source).toContain("return true;");
    expect(source).toContain("return projectStateResult.data?.scheduling_status === 'confirmed';");
    expect(source).toMatch(
      /const scheduleConfirmed =[\s\S]*?\.update\(nextProjectState\)[\s\S]*?if \(scheduleConfirmed\) \{[\s\S]*?generate-material-orders/
    );
    expect(source).not.toContain("throw new Error(`Project ${project_id} could not be activated after payment`)");
  });

  it('marks paid GC concierge bookings from Stripe metadata without approving quotes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/stripe-webhook/index.ts'),
      'utf8',
    );

    expect(source).toContain('gc_concierge_booking_id');
    expect(source).toContain(".from('gc_concierge_bookings')");
    expect(source).toContain("payment_status: 'paid'");
    expect(source).toContain('gc_concierge_booking_paid');
    expect(source).toMatch(
      /if \(gc_concierge_booking_id\)[\s\S]*?\.update\(\{ payment_status: 'paid', paid_at: new Date\(\)\.toISOString\(\) \}\)/
    );
  });
});

describe('send-push source guards', () => {
  it('sends GC workflow updates as specific prompts, not generic messages', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/send-push/index.ts'),
      'utf8',
    );

    expect(source).toContain("case 'gc_approval_requested':");
    expect(source).toContain("title: 'GC Approval Needed'");
    expect(source).toContain('A General Contractor recommendation needs your approval.');
    expect(source).toContain("case 'gc_approval_responded':");
    expect(source).toContain("title: 'Homeowner Responded'");
    expect(source).toContain("case 'gc_management_invited':");
    expect(source).toContain("title: 'GC Management Approval Needed'");
    expect(source).toContain('A General Contractor created a draft project for your approval.');
    expect(source).toContain("case 'gc_management_invite_received':");
    expect(source).toContain("title: 'GC Management Invite'");
    expect(source).toContain('A homeowner invited you to manage their project.');
    expect(source).toContain("case 'gc_management_confirmed':");
    expect(source).toContain("title: 'GC Management Active'");
    expect(source).toContain('GC management is now active for this project.');
    expect(source).toContain("case 'gc_payment_requested':");
    expect(source).toContain("title: 'GC Payment Request'");
    expect(source).toContain("case 'gc_payment_responded':");
    expect(source).toContain("title: 'Payment Request Updated'");
    expect(source).toContain("case 'gc_concierge_booking_requested':");
    expect(source).toContain("title: 'New Concierge Request'");
    expect(source).toContain("case 'gc_concierge_booking_responded':");
    expect(source).toContain("title: 'Concierge Request Updated'");
    expect(source).toContain("case 'gc_concierge_booking_paid':");
    expect(source).toContain("title: 'Concierge Booking Paid'");
    expect(source).toContain('The homeowner paid for the accepted concierge booking.');
    expect(source).toContain("case 'gc_trade_negotiation_requested':");
    expect(source).toContain("title: 'Quote Revision Requested'");
    expect(source).toContain("case 'gc_trade_negotiation_responded':");
    expect(source).toContain("title: 'Trade Responded'");
    expect(source).toContain("case 'quote_approved':");
    expect(source).toContain("title: 'Quote Funded'");
    expect(source).toContain('Funds are held in escrow until milestones are approved.');
    expect(source).not.toContain(`Quote Approved ${String.fromCharCode(0x2014)} Project Active`);
    expect(source).toMatch(
      /case 'order_delivered':[\s\S]*?case 'gc_approval_requested':[\s\S]*?case 'gc_trade_negotiation_responded':[\s\S]*?return 'milestone_updates';/
    );
  });

  it('keeps live notification types behind user push preferences', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/send-push/index.ts'),
      'utf8',
    );
    const preferenceMapper = source.slice(source.indexOf('function notificationPreferenceKey'));

    expect(preferenceMapper).toMatch(
      /case 'milestone_paid':[\s\S]*?case 'supplier_paid':[\s\S]*?case 'gc_concierge_payout_released':[\s\S]*?return 'payment_updates';/
    );
    expect(preferenceMapper).toMatch(
      /case 'job_accepted':[\s\S]*?case 'slot_accepted':[\s\S]*?case 'dispute_raised':[\s\S]*?return 'milestone_updates';/
    );
  });
});

describe('create-gc-concierge-payment-intent source guards', () => {
  it('creates Stripe intents only for accepted homeowner-owned concierge bookings', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/create-gc-concierge-payment-intent/index.ts'),
      'utf8',
    );

    expect(source).toContain("const { booking_id } = await req.json();");
    expect(source).toContain("requesterAppUser?.role !== 'homeowner'");
    expect(source).toContain("booking.homeowner_id !== user.id");
    expect(source).toContain("booking.status !== 'accepted'");
    expect(source).toContain('general_contractor:general_contractors');
    expect(source).toContain('hasCompleteGcConciergeProfile(gc)');
    expect(source).toContain("appUser?.role !== 'general_contractor'");
    expect(source).toContain('license_number, license_doc_url, insurance_doc_url');
    expect(source).toContain('Concierge booking is no longer available for payment');
    expect(source).toContain("booking.payment_status === 'paid'");
    expect(source).toContain("gc_concierge_booking_id: booking.id");
    expect(source).toContain("payment_status: 'payment_pending'");
    expect(source).toContain("transfer_group: `gc_concierge_${booking.id}`");
  });
});

describe('gc-concierge-payout source guards', () => {
  it('requires homeowner ownership, paid booking state, and Stripe transfer idempotency', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/gc-concierge-payout/index.ts'),
      'utf8',
    );

    expect(source).toContain('/schema cache/i.test(message)');
    expect(source).toContain("const { booking_id } = await req.json();");
    expect(source).toContain("requesterAppUser?.role !== 'homeowner'");
    expect(source).toContain('booking.homeowner_id !== user.id');
    expect(source).toContain("booking.status !== 'accepted'");
    expect(source).toContain("booking.payment_status !== 'paid'");
    expect(source).toContain('verified, concierge_enabled, stripe_account_id');
    expect(source).toContain('hasCompleteGcConciergeProfile(gc)');
    expect(source).toContain("appUser?.role !== 'general_contractor'");
    expect(source).toContain('license_number, license_doc_url, insurance_doc_url');
    expect(source).toContain('General contractor is no longer eligible for concierge payouts');
    expect(source).toContain('assertStripePayoutReady');
    expect(source).toContain('stripe.transfers.create');
    expect(source).toContain("transfer_group: `gc_concierge_${booking.id}`");
    expect(source).toContain("{ idempotencyKey: `gc-concierge-payout-${booking.id}` }");
    expect(source).toContain("status: 'completed'");
    expect(source).toContain("type: 'gc_concierge_payout_released'");
    expect(source).toMatch(
      /stripe\.transfers\.create[\s\S]*?\.update\(\{[\s\S]*?status: 'completed'[\s\S]*?stripe_transfer_id: transfer\.id/
    );
  });
});

describe('homeowner money action source guards', () => {
  it('requires current homeowner role before creating project quote payment intents', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/create-payment-intent/index.ts'),
      'utf8',
    );

    expect(source).toContain("requesterAppUser?.role !== 'homeowner'");
    expect(source).toContain('if (project.homeowner_id !== user.id)');
    expect(source).toMatch(
      /requesterAppUser\?\.role !== 'homeowner'[\s\S]*?const \{ quote_id, project_id: pid \} = await req\.json\(\);[\s\S]*?if \(project\.homeowner_id !== user\.id\)[\s\S]*?const paymentIntent = await stripe\.paymentIntents\.create/
    );
  });

  it('requires current homeowner role before releasing supplier payouts', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/supplier-payout/index.ts'),
      'utf8',
    );

    expect(source).toContain("requesterAppUser?.role !== 'homeowner'");
    expect(source).toContain('if (project?.homeowner_id !== user.id)');
    expect(source).toMatch(
      /requesterAppUser\?\.role !== 'homeowner'[\s\S]*?const \{ order_id \} = await req\.json\(\);[\s\S]*?if \(project\?\.homeowner_id !== user\.id\)[\s\S]*?const transfer = await stripe\.transfers\.create/
    );
  });
});

describe('release-milestone source guards', () => {
  it('allows externally managed trade slots to close out without WalkerAI quote funding', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/release-milestone/index.ts'),
      'utf8',
    );

    expect(source).toContain(".select('id, assigned_company_id, status, fulfillment_type')");
    expect(source).toContain("const externalSlotsReady = requiredSlots");
    expect(source).toContain("slot.fulfillment_type === 'external'");
    expect(source).toContain("const quoteRequiredSlots = requiredSlots.filter((slot) => slot.fulfillment_type !== 'external');");
    expect(source).toContain('if (quoteRequiredSlots.length === 0) return true;');
    expect(source).toContain('return quoteRequiredSlots.every((slot) => (');
  });

  it('limits the active dispute lookup before maybeSingle', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/release-milestone/index.ts'),
      'utf8',
    );

    expect(source).toMatch(
      /\.from\('disputes'\)[\s\S]*?\.in\('status', \['open', 'under_review'\]\)[\s\S]*?\.limit\(1\)[\s\S]*?\.maybeSingle\(\)/
    );
  });

  it('requires milestone progress evidence before creating a Stripe transfer', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/release-milestone/index.ts'),
      'utf8',
    );

    expect(source).toContain('async function hasMilestoneProgressEvidence');
    expect(source).toContain(".from('project_photos')");
    expect(source).toContain(".like('storage_path', `${projectId}/milestones/${milestoneId}/%`)");
    expect(source).toContain(".from('messages')");
    expect(source).toContain(".ilike('body', `%milestone:${milestoneId}%`)");
    expect(source).toContain('const hasProgressEvidence = await hasMilestoneProgressEvidence(adminClient, project.id, milestone_id);');
    expect(source).toContain('Progress photo evidence is required before milestone payment can be released');
    expect(source).toMatch(
      /const hasProgressEvidence = await hasMilestoneProgressEvidence[\s\S]*?Progress photo evidence is required before milestone payment can be released[\s\S]*?const transfer = await stripe\.transfers\.create/
    );
  });

  it('keeps milestone escrow release under homeowner authority only', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/release-milestone/index.ts'),
      'utf8',
    );

    expect(source).toContain('// Authorization: only the homeowner can release milestones');
    expect(source).toContain("requesterAppUser?.role !== 'homeowner'");
    expect(source).toContain('if (project.homeowner_id !== user.id)');
    expect(source).toMatch(
      /if \(project\.homeowner_id !== user\.id\) \{[\s\S]*?status: 403[\s\S]*?\}[\s\S]*?const hasProgressEvidence = await hasMilestoneProgressEvidence[\s\S]*?const transfer = await stripe\.transfers\.create/
    );
    expect(source).not.toMatch(/appUser\?\.role === 'general_contractor'[\s\S]*?stripe\.transfers\.create/);
  });

  it('defers active GC-managed project completion to homeowner approval', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/release-milestone/index.ts'),
      'utf8',
    );

    expect(source).toContain('async function hasActiveGcManagement');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain('general_contractors!inner');
    expect(source).toContain(".eq('status', 'active')");
    expect(source).toContain(".eq('general_contractors.verified', true)");
    expect(source).toContain('function hasCompleteGcCompletionProfile');
    expect(source).toContain(".from('users')");
    expect(source).toContain("appUser?.role === 'general_contractor'");
    expect(source).toContain('const gcCompletionApprovalRequired = isFinalProjectMilestone && await hasActiveGcManagement(adminClient, project.id);');
    expect(source).toContain("if (isFinalProjectMilestone && project.status !== 'completed' && !gcCompletionApprovalRequired)");
    expect(source).toContain('if (isFinalProjectMilestone && !gcCompletionApprovalRequired)');
    expect(source).toContain('gc_completion_approval_required: gcCompletionApprovalRequired');
    expect(source).toContain('GC-managed projects');
    expect(source).toContain('dedicated homeowner completion approval');
  });
});

describe('claim-material-order source guards', () => {
  it('uses cached supplier Stripe readiness before live Stripe retrieval when claiming orders', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/claim-material-order/index.ts'),
      'utf8',
    );

    expect(source).toContain('function hasStripeReadinessFields');
    expect(source).toContain('stripe_details_submitted, stripe_payouts_enabled, stripe_transfers_active');
    expect(source).toContain('if (record.stripe_details_submitted && record.stripe_payouts_enabled && record.stripe_transfers_active)');
    expect(source).toContain('await assertStripePayoutReady(supplier)');
    expect(source).not.toContain('await assertStripePayoutReady(supplier.stripe_account_id)');
  });

  it('falls back safely when the atomic claim RPC is missing', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/claim-material-order/index.ts'),
      'utf8',
    );

    expect(source).toContain("isMissingFunctionError(claimErr, 'atomic_claim_material_order')");
    expect(source).toContain("claimedWithFallback = !!claimedOrder");
    expect(source).toMatch(
      /\.from\('material_orders'\)[\s\S]*?\.update\(\{ status: 'accepted', accepted_supplier_id: supplier\.id \}\)[\s\S]*?\.eq\('id', order_id\)[\s\S]*?\.eq\('status', 'open'\)[\s\S]*?\.is\('accepted_supplier_id', null\)[\s\S]*?\.select\('id'\)[\s\S]*?\.maybeSingle\(\)/
    );
  });

  it('enforces supplier service radius without the fulfillment RPC when lat/lng data is available', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/claim-material-order/index.ts'),
      'utf8',
    );

    expect(source).toContain('function canFulfillByLatLngFallback');
    expect(source).toContain('function haversineKm');
    expect(source).toContain('projects:project_id(lat, lng)');
    expect(source).toContain('lat, lng, service_radius_km');
    expect(source).toContain("isMissingFunctionError(fulfillErr, 'supplier_can_fulfill_material_order')");
    expect(source).toMatch(
      /const fallbackCanFulfill = canFulfillByLatLngFallback\(supplier, order\);[\s\S]*?fallbackCanFulfill === false[\s\S]*?SERVICE_AREA_MISMATCH/
    );
  });

  it('notifies active GC managers when a supplier claims a project material order', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/claim-material-order/index.ts'),
      'utf8',
    );

    expect(source).toContain('Notify homeowner, assigned contractors, and the active GC manager');
    expect(source).toContain('const notifiedUserIds = new Set<string>()');
    expect(source).toContain(".from('general_contractor_projects')");
    expect(source).toContain(".select('general_contractors!inner(user_id)')");
    expect(source).toContain(".eq('project_id', order.project_id)");
    expect(source).toContain(".eq('status', 'active')");
    expect(source).toContain('claim-material-order GC notification lookup error');
    expect(source).toContain('A supplier has claimed a material order for a project you manage.');
    expect(source).toContain('`/(general-contractor)/project/${order.project_id}/materials`');
    expect(source).toMatch(
      /const addNotification[\s\S]*?type: 'material_order_claimed'/
    );
    expect(source).toMatch(
      /for \(const assignment of gcAssignments \?\? \[\]\)[\s\S]*?addNotification\(contractor\?\.user_id,[\s\S]*?\}\);/
    );
  });
});

describe('accept-job source guards', () => {
  it('uses cached company Stripe readiness before live Stripe retrieval when accepting jobs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/accept-job/index.ts'),
      'utf8',
    );

    expect(source).toContain('function hasStripeReadinessFields');
    expect(source).toContain('stripe_details_submitted, stripe_payouts_enabled, stripe_transfers_active');
    expect(source).toContain('if (record.stripe_details_submitted && record.stripe_payouts_enabled && record.stripe_transfers_active)');
    expect(source).toContain('await assertStripePayoutReady(company)');
    expect(source).not.toContain('await assertStripePayoutReady(company.stripe_account_id)');
  });

  it('falls back when atomic slot acceptance is missing and normalizes joined project rows', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/accept-job/index.ts'),
      'utf8',
    );

    expect(source).toContain('function firstJoinedRow<T>');
    expect(source).toContain('function acceptSlotWithConditionalUpdate');
    expect(source).toContain('isMissingAtomicSlotRpcError(acceptError)');
    expect(source).toContain('accepted = await acceptSlotWithConditionalUpdate(adminClient, slot_id, company.id)');
    expect(source).toContain('const proj = firstJoinedRow(');
    expect(source).toContain("type: 'slot_accepted'");
    expect(source).toContain("type: 'all_slots_filled'");
  });

  it('rejects expired slot dispatch windows before accepting a trade slot', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/accept-job/index.ts'),
      'utf8',
    );

    expect(source).toContain('function isSlotAcceptanceWindowOpen');
    expect(source).toContain("project.status !== 'dispatching'");
    expect(source).toContain("Date.parse(project.dispatch_expires_at ?? '')");
    expect(source).toContain('async function assertSlotAcceptanceWindowOpen');
    expect(source).toContain(".select('id, projects(status, dispatch_expires_at)')");
    expect(source).toContain('This dispatch window has expired. Wait for the homeowner to redispatch this trade.');
    expect(source).toMatch(
      /await assertSlotAcceptanceWindowOpen\(adminClient, slot_id\);[\s\S]*?adminClient\.rpc\('atomic_accept_slot'/
    );
    expect(source).toMatch(
      /async function acceptSlotWithConditionalUpdate[\s\S]*?await assertSlotAcceptanceWindowOpen\(adminClient, slotId\);[\s\S]*?\.from\('dispatch_logs'\)/
    );
  });

  it('creates a priced summary line item for AI-priced whole-project auto quotes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/accept-job/index.ts'),
      'utf8',
    );

    expect(source).toContain('const quoteSummaryLineItem = {');
    expect(source).toContain("description: 'WalkerAI AI estimate package'");
    expect(source).toContain('unit_cost: avgCost');
    expect(source).toContain('total_cost: avgCost');
    expect(source).toContain('quoteSummaryLineItem,');
    expect(source).toContain('unit_cost: null');
    expect(source).toContain('total_cost: null');
    expect(source).not.toContain('if (lineItems.length > 0)');
  });

  it('requires a manual quote after legacy acceptance when the AI budget is missing', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/accept-job/index.ts'),
      'utf8',
    );

    expect(source).toContain('let autoQuoteCreated = false;');
    expect(source).toContain('autoQuoteCreated = true;');
    expect(source).toContain('Job accepted but project AI budget is missing; manual quote is required.');
    expect(source).toContain('needs_quote: !autoQuoteCreated || warnings.some');
  });
});

describe('analyze-photos source guards', () => {
  it('accepts media-typed base64 payloads without breaking legacy string payloads', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/analyze-photos/index.ts'),
      'utf8',
    );

    expect(source).toContain('type PhotoBase64Payload = string |');
    expect(source).toContain('function normalizePhotoPayload');
    expect(source).toContain('media_type: normalized.mediaType');
    expect(source).toContain('data: normalized.data');
    expect(source).toContain("if (typeof payload === 'string')");
  });

  it('keeps project-fetch timeouts non-fatal without service-role writes before ownership verification', () => {
    const edgeFunction = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/analyze-photos/index.ts'),
      'utf8',
    );
    const analyzingScreen = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/create/analyzing.tsx'),
      'utf8',
    );

    expect(analyzingScreen).toContain('room_type: selectedRoomType');
    expect(edgeFunction).toContain('const requestedRoomType = room_type ===');
    expect(edgeFunction).toContain('let projectOwnerVerified = false');
    expect(edgeFunction).toContain('projectOwnerVerified = true');
    expect(edgeFunction).toContain("console.warn('ai_analysis persist skipped because project ownership was not verified')");
    expect(edgeFunction).not.toContain('const roomType = project.room_type');
  });
});

describe('generate-diy-guide source guards', () => {
  it('verifies project ownership and uploaded photo rows before generating a guide', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-diy-guide/index.ts'),
      'utf8',
    );

    expect(source).toContain(".select('id, homeowner_id')");
    expect(source).toContain("if (project.homeowner_id !== user.id)");
    expect(source).toContain("return jsonResponse({ error: 'You can only generate a DIY guide for your own project' }, 403)");
    expect(source).toContain(".from('project_photos')");
    expect(source).toContain(".eq('project_id', project_id)");
    expect(source).toContain(".in('url', requestedPhotoUrls)");
    expect(source).toContain('const safePhotoUrls = requestedPhotoUrls.filter');
    expect(source).toContain('for (const url of safePhotoUrls)');
  });

  it('requires the generated DIY guide to persist to the homeowner project', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-diy-guide/index.ts'),
      'utf8',
    );

    expect(source).toContain(".eq('homeowner_id', user.id)");
    expect(source).toContain("if (persistError) throw new Error(`DIY guide could not be saved: ${persistError.message}`);");
    expect(source).toContain("if (!persistedProject) throw new Error('DIY guide could not be saved to this project');");
    expect(source).not.toContain("console.warn('generate-diy-guide persist failed:");
  });

  it('sniffs fetched DIY image bytes instead of labeling every upload as JPEG', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/generate-diy-guide/index.ts'),
      'utf8',
    );

    expect(source).toContain("type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'");
    expect(source).toContain('function sniffVisionMediaType');
    expect(source).toContain('async function urlToVisionImage');
    expect(source).toContain('media_type: image.mediaType');
    expect(source).toContain('data: image.data');
    expect(source).toContain("DIY guide photos must be JPEG, PNG, GIF, or WebP images");
    expect(source).not.toContain("media_type: 'image/jpeg', data: b64");
  });
});
