import { formatSupabaseFunctionError } from '../src/lib/supabase/functions';

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

  it('falls back to SDK error messages', async () => {
    await expect(formatSupabaseFunctionError(new Error('Network request failed'))).resolves.toBe('Network request failed');
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
});

describe('QA account seed source guards', () => {
  it('allows create-test-user to create a verified general contractor profile', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/create-test-user/index.ts'),
      'utf8',
    );

    expect(source).toContain("'general_contractor'");
    expect(source).toContain("body.role === 'general_contractor'");
    expect(source).toContain(".from('general_contractors').upsert");
    expect(source).toContain('verified: true');
    expect(source).toContain('concierge_enabled: true');
    expect(source).toContain("stripe_account_id: 'acct_qa_gc_test'");
    expect(source).toContain('stripe_payouts_enabled: true');
    expect(source).toContain("profile: body.role === 'general_contractor' ? 'verified_general_contractor' : null");
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
    expect(source).toContain('lat: 43.6532');
    expect(source).toContain('lng: -79.3832');
    expect(source).not.toContain('is_verified');
    expect(source).not.toContain('latitude:');
    expect(source).not.toContain('longitude:');
    expect(source).not.toContain('stripe_onboarding_completed');
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
    expect(source).toContain('role: requestedRole');
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
    expect(source).toContain('const requesterIsHomeowner = project.homeowner_id === requesterId;');
    expect(source).toContain('if (!requesterIsHomeowner && !requesterIsActiveGc)');
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
});

describe('quote submission status sync migration', () => {
  it('moves homeowner-visible projects into quoting when a pending quote is submitted', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260605001700_sync_project_status_on_quote_submission.sql'),
      'utf8',
    );

    expect(source).toContain('CREATE OR REPLACE FUNCTION public.sync_project_status_on_quote_submission()');
    expect(source).toContain("IF NEW.status = 'pending' THEN");
    expect(source).toContain('UPDATE public.projects');
    expect(source).toContain("SET status = 'quoting'");
    expect(source).toContain("AND status IN ('dispatching', 'accepted', 'scheduling')");
    expect(source).toContain('CREATE TRIGGER sync_project_status_on_quote_submission_trigger');
    expect(source).toContain('AFTER INSERT OR UPDATE OF status ON public.quotes');
    expect(source).toContain("WHEN (NEW.status = 'pending')");
    expect(source).toContain('EXECUTE FUNCTION public.sync_project_status_on_quote_submission()');
  });
});

describe('stripe-webhook source guards', () => {
  it('does not activate trade-slot projects before schedule confirmation', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/stripe-webhook/index.ts'),
      'utf8',
    );

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

describe('create-gc-concierge-payment-intent source guards', () => {
  it('creates Stripe intents only for accepted homeowner-owned concierge bookings', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/create-gc-concierge-payment-intent/index.ts'),
      'utf8',
    );

    expect(source).toContain("const { booking_id } = await req.json();");
    expect(source).toContain("booking.homeowner_id !== user.id");
    expect(source).toContain("booking.status !== 'accepted'");
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

    expect(source).toContain("const { booking_id } = await req.json();");
    expect(source).toContain('booking.homeowner_id !== user.id');
    expect(source).toContain("booking.status !== 'accepted'");
    expect(source).toContain("booking.payment_status !== 'paid'");
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

describe('release-milestone source guards', () => {
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
});

describe('claim-material-order source guards', () => {
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
});

describe('accept-job source guards', () => {
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
