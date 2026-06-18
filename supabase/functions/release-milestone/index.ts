import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function stripeReadiness(account: Stripe.Account) {
  return {
    stripe_details_submitted: account.details_submitted,
    stripe_payouts_enabled: account.payouts_enabled,
    stripe_transfers_active: account.capabilities?.transfers === 'active',
    stripe_onboarding_checked_at: new Date().toISOString(),
  };
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
}

async function updateStripeReadiness(
  adminClient: ReturnType<typeof createClient>,
  table: 'companies' | 'suppliers',
  id: string,
  readiness: ReturnType<typeof stripeReadiness> & { stripe_account_id: string },
) {
  const result = await adminClient
    .from(table)
    .update(readiness)
    .eq('id', id);

  if (!isMissingColumnError(result.error)) {
    if (result.error) throw result.error;
    return;
  }

  const fallback = await adminClient
    .from(table)
    .update({ stripe_account_id: readiness.stripe_account_id })
    .eq('id', id);
  if (fallback.error) throw fallback.error;
}

async function assertStripePayoutReady(
  stripe: Stripe,
  adminClient: ReturnType<typeof createClient>,
  companyId: string,
  stripeAccountId: string | null,
): Promise<void> {
  if (!stripeAccountId) {
    throw new Error('Contractor has not completed Stripe onboarding');
  }

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const readiness = { stripe_account_id: account.id, ...stripeReadiness(account) };
  await updateStripeReadiness(adminClient, 'companies', companyId, readiness);

  if (!readiness.stripe_details_submitted || !readiness.stripe_payouts_enabled || !readiness.stripe_transfers_active) {
    throw new Error('Contractor must finish Stripe payout onboarding before milestone payment can be released');
  }
}

async function hasMilestoneProgressEvidence(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
  milestoneId: string,
): Promise<boolean> {
  const [photoResult, messageResult] = await Promise.all([
    adminClient
      .from('project_photos')
      .select('id')
      .eq('project_id', projectId)
      .like('storage_path', `${projectId}/milestones/${milestoneId}/%`)
      .limit(1),
    adminClient
      .from('messages')
      .select('id')
      .eq('project_id', projectId)
      .not('attachment_url', 'is', null)
      .ilike('body', `%milestone:${milestoneId}%`)
      .limit(1),
  ]);

  if (photoResult.error) {
    throw new Error(`Failed to verify milestone progress photos: ${photoResult.error.message}`);
  }
  if (messageResult.error) {
    throw new Error(`Failed to verify milestone progress messages: ${messageResult.error.message}`);
  }

  return (photoResult.data?.length ?? 0) > 0 || (messageResult.data?.length ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

  try {
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: requesterAppUser, error: requesterRoleError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (requesterRoleError) throw requesterRoleError;
    if (requesterAppUser?.role !== 'homeowner') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { milestone_id } = await req.json();

    // Load milestone with full context
    const { data: milestone, error: msError } = await adminClient
      .from('milestones')
      .select(`
        id, title, amount, status, sort_order, stripe_transfer_id,
        quote:quotes (
          id, total_amount, status, commission_rate, stripe_payment_intent_id, company_id,
          project:projects (
            id, homeowner_id, province, status
          ),
          company:companies (
            id, user_id, stripe_account_id, province
          )
        )
      `)
      .eq('id', milestone_id)
      .single();

    if (msError || !milestone) {
      return new Response(JSON.stringify({ error: 'Milestone not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quote = (Array.isArray(milestone.quote) ? milestone.quote[0] : milestone.quote) as {
      id: string;
      total_amount: number;
      status: string;
      commission_rate: number;
      stripe_payment_intent_id: string;
      company_id: string;
      project: {
        id: string;
        homeowner_id: string;
        province: string;
        status: string;
      };
      company: {
        id: string;
        user_id: string;
        stripe_account_id: string;
        province: string;
      };
    } | null;

    const project = Array.isArray(quote?.project) ? quote?.project[0] : quote?.project;
    const company = Array.isArray(quote?.company) ? quote?.company[0] : quote?.company;

    if (!quote || !project || !company) {
      return new Response(JSON.stringify({ error: 'Milestone context is incomplete' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (quote.status !== 'approved') {
      return new Response(
        JSON.stringify({ error: 'Quote must be funded before milestone payment can be released' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: only the homeowner can release milestones
    if (project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check no active dispute on the project
    const { data: dispute, error: disputeError } = await adminClient
      .from('disputes')
      .select('id')
      .eq('project_id', project.id)
      .in('status', ['open', 'under_review'])
      .limit(1)
      .maybeSingle();

    if (disputeError) {
      throw new Error(`Failed to check project disputes: ${disputeError.message}`);
    }

    if (dispute) {
      return new Response(
        JSON.stringify({ error: 'Cannot release payment while a dispute is active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine if this is the final milestone for this quote. Project completion
    // is checked separately across every approved quote in the project.
    const { data: allMilestones, error: allMilestonesError } = await adminClient
      .from('milestones')
      .select('id, amount, status')
      .eq('quote_id', quote.id);

    if (allMilestonesError) {
      throw new Error(`Failed to load quote milestones: ${allMilestonesError.message}`);
    }

    const remainingMilestones = (allMilestones ?? []).filter(
      (m: { id: string; status: string; amount: number }) =>
        m.id !== milestone_id && m.status !== 'paid' && m.status !== 'homeowner_approved'
    );
    const isFinalQuoteMilestone = remainingMilestones.length === 0;

    if (milestone.status === 'paid' && !milestone.stripe_transfer_id) {
      return new Response(
        JSON.stringify({ error: 'Milestone is marked paid but is missing a Stripe transfer id' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (milestone.stripe_transfer_id) {
      const isFinalProjectMilestone = await allApprovedProjectMilestonesReleased(adminClient, project.id);
      const gcCompletionApprovalRequired = isFinalProjectMilestone && await hasActiveGcManagement(adminClient, project.id);
      if (isFinalProjectMilestone && project.status !== 'completed' && !gcCompletionApprovalRequired) {
        await completeProjectAndNotify(
          adminClient,
          project.id,
          project.homeowner_id,
          company.user_id,
          'Milestone already paid but project completion repair failed',
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          already_released: true,
          transfer_id: milestone.stripe_transfer_id,
          is_final_milestone: isFinalQuoteMilestone,
          is_final_quote_milestone: isFinalQuoteMilestone,
          is_final_project_milestone: isFinalProjectMilestone,
          gc_completion_approval_required: gcCompletionApprovalRequired,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate milestone is ready for release
    if (milestone.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Milestone must be marked complete by contractor before approval' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasProgressEvidence = await hasMilestoneProgressEvidence(adminClient, project.id, milestone_id);
    if (!hasProgressEvidence) {
      return new Response(
        JSON.stringify({ error: 'Progress photo evidence is required before milestone payment can be released' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate transfer amount
    const commissionRate = quote.commission_rate ?? 0.10;
    let transferAmount: number;

    if (isFinalQuoteMilestone) {
      // On final milestone: deduct entire commission from the total remaining
      const totalPaid = (allMilestones ?? [])
        .filter((m: { id: string; status: string; amount: number }) => m.status === 'paid' || m.status === 'homeowner_approved')
        .reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);

      const totalCommission = Math.round(quote.total_amount * commissionRate);
      const commissionAlreadyDeducted = Math.round(totalPaid * commissionRate);
      const remainingCommission = totalCommission - commissionAlreadyDeducted;
      transferAmount = milestone.amount - remainingCommission;
    } else {
      // For intermediate milestones, pro-rate the commission
      transferAmount = Math.round(milestone.amount * (1 - commissionRate));
    }

    try {
      await assertStripePayoutReady(stripe, adminClient, company.id, company.stripe_account_id);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Contractor has not completed Stripe onboarding' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (transferAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Calculated contractor payout must be greater than zero' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Stripe transfer to company's Connect account
    // Funds move from WalkerAI platform balance to company
    const transfer = await stripe.transfers.create(
      {
        amount: transferAmount, // CAD cents
        currency: 'cad',
        destination: company.stripe_account_id,
        metadata: {
          project_id: project.id,
          milestone_id,
          quote_id: quote.id,
          commission_rate: commissionRate.toString(),
          is_final_milestone: isFinalQuoteMilestone.toString(),
        },
        description: `WalkerAI Milestone Release — ${milestone.title}`,
      },
      { idempotencyKey: `milestone-release-${milestone_id}` }
    );

    // Update milestone status
    let updateMilestoneResult = await adminClient
      .from('milestones')
      .update({
        status: 'paid',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        stripe_transfer_id: transfer.id,
      })
      .eq('id', milestone_id);

    if (isMissingColumnError(updateMilestoneResult.error)) {
      updateMilestoneResult = await adminClient
        .from('milestones')
        .update({
          status: 'paid',
          stripe_transfer_id: transfer.id,
        })
        .eq('id', milestone_id);
    }

    const updateMilestoneError = updateMilestoneResult.error;
    if (updateMilestoneError) {
      throw new Error(`Transfer created but milestone update failed: ${updateMilestoneError.message}`);
    }

    // Notify company
    const { error: companyNotificationError } = await adminClient.from('notifications').insert({
      user_id: company.user_id,
      type: 'milestone_paid',
      payload: {
        project_id: project.id,
        milestone_id,
        milestone_title: milestone.title,
        amount: transferAmount,
        is_final: isFinalQuoteMilestone,
        deep_link: `/(company)/job/${project.id}/milestones`,
      },
    });

    if (companyNotificationError) {
      console.warn('Milestone paid but company notification failed:', companyNotificationError.message);
    }

    const isFinalProjectMilestone = await allApprovedProjectMilestonesReleased(adminClient, project.id);
    const gcCompletionApprovalRequired = isFinalProjectMilestone && await hasActiveGcManagement(adminClient, project.id);

    // If this was the final outstanding milestone across all approved trade
    // quotes, trigger project completion + review flow. GC-managed projects
    // still require the dedicated homeowner completion approval.
    if (isFinalProjectMilestone && !gcCompletionApprovalRequired) {
      await completeProjectAndNotify(
        adminClient,
        project.id,
        project.homeowner_id,
        company.user_id,
        'Final milestone paid but project completion update failed',
      );
    }

    // Calculate HST on commission (WalkerAI owes this to CRA)
    const commissionAmount = milestone.amount - transferAmount;
    const hstRate = await getHSTRate(adminClient, company.province);
    const hstOwed = Math.round(commissionAmount * hstRate);

    return new Response(
      JSON.stringify({
        success: true,
        transfer_id: transfer.id,
        transfer_amount_cad_cents: transferAmount,
        commission_amount_cad_cents: commissionAmount,
        hst_on_commission_cents: hstOwed,
        is_final_milestone: isFinalQuoteMilestone,
        is_final_quote_milestone: isFinalQuoteMilestone,
        is_final_project_milestone: isFinalProjectMilestone,
        gc_completion_approval_required: gcCompletionApprovalRequired,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('release-milestone error:', err);

    if (err instanceof Stripe.errors.StripeError) {
      return new Response(JSON.stringify({ error: `Stripe error: ${err.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getHSTRate(
  adminClient: ReturnType<typeof createClient>,
  province: string
): Promise<number> {
  const { data } = await adminClient.rpc('canadian_tax_rate', { province_code: province });
  return (data as number) ?? 0.05;
}

async function completeProjectAndNotify(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
  homeownerId: string,
  fallbackCompanyUserId: string,
  updateErrorPrefix: string,
) {
  const { error: projectUpdateError } = await adminClient
    .from('projects')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', projectId);

  if (projectUpdateError) {
    throw new Error(`${updateErrorPrefix}: ${projectUpdateError.message}`);
  }

  const companyUserIds = new Set<string>();
  if (fallbackCompanyUserId) companyUserIds.add(fallbackCompanyUserId);

  const { data: approvedQuoteCompanies, error: approvedQuoteCompaniesError } = await adminClient
    .from('quotes')
    .select('companies(user_id)')
    .eq('project_id', projectId)
    .eq('status', 'approved');

  if (approvedQuoteCompaniesError) {
    console.warn('Project completed but approved company review lookup failed:', approvedQuoteCompaniesError.message);
  } else {
    for (const row of approvedQuoteCompanies ?? []) {
      const company = Array.isArray((row as any).companies)
        ? (row as any).companies[0]
        : (row as any).companies;
      if (company?.user_id) companyUserIds.add(company.user_id);
    }
  }

  const notifications = [
    {
      user_id: homeownerId,
      type: 'project_complete',
      payload: {
        project_id: projectId,
        message: 'Your renovation is complete! Please leave a review.',
        deep_link: `/(homeowner)/project/${projectId}`,
      },
    },
    ...Array.from(companyUserIds).map((userId) => ({
      user_id: userId,
      type: 'project_complete',
      payload: {
        project_id: projectId,
        message: 'Project complete. Leave a review for this homeowner.',
        deep_link: `/(company)/job/${projectId}`,
      },
    })),
  ];

  const { error: completionNotificationError } = await adminClient.from('notifications').insert(notifications);

  if (completionNotificationError) {
    console.warn('Project completed but review notifications failed:', completionNotificationError.message);
  }
}

async function hasActiveGcManagement(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await adminClient
    .from('general_contractor_projects')
    .select(`
      id,
      general_contractors!inner (
        user_id, verified, business_name, city, province, lat, lng,
        license_number, license_doc_url, insurance_doc_url
      )
    `)
    .eq('project_id', projectId)
    .eq('status', 'active')
    .eq('general_contractors.verified', true);

  if (error) {
    throw new Error(`Failed to check GC project management status: ${error.message}`);
  }

  const activeManagers = (data ?? []) as Array<{
    general_contractors?: {
      user_id: string | null;
      verified: boolean | null;
      business_name: string | null;
      city: string | null;
      province: string | null;
      lat: number | null;
      lng: number | null;
      license_number: string | null;
      license_doc_url: string | null;
      insurance_doc_url: string | null;
    } | Array<{
      user_id: string | null;
      verified: boolean | null;
      business_name: string | null;
      city: string | null;
      province: string | null;
      lat: number | null;
      lng: number | null;
      license_number: string | null;
      license_doc_url: string | null;
      insurance_doc_url: string | null;
    }> | null;
  }>;

  for (const row of activeManagers) {
    const gc = Array.isArray(row.general_contractors)
      ? row.general_contractors[0] ?? null
      : row.general_contractors ?? null;
    if (!hasCompleteGcCompletionProfile(gc)) continue;

    const { data: appUser, error: appUserError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', gc.user_id)
      .maybeSingle();
    if (appUserError) {
      throw new Error(`Failed to check GC account role: ${appUserError.message}`);
    }
    if (appUser?.role === 'general_contractor') return true;
  }

  return false;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCompleteGcCompletionProfile(gc: {
  user_id: string | null;
  verified: boolean | null;
  business_name: string | null;
  city: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  license_number: string | null;
  license_doc_url: string | null;
  insurance_doc_url: string | null;
} | null | undefined): gc is {
  user_id: string;
  verified: true;
  business_name: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
  license_number: string;
  license_doc_url: string;
  insurance_doc_url: string;
} {
  return hasText(gc?.user_id)
    && gc?.verified === true
    && hasText(gc.business_name)
    && hasText(gc.city)
    && hasText(gc.province)
    && typeof gc.lat === 'number'
    && typeof gc.lng === 'number'
    && hasText(gc.license_number)
    && hasText(gc.license_doc_url)
    && hasText(gc.insurance_doc_url);
}

async function allFilledSlotsHaveApprovedQuotes(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  const { data: slots, error: slotsError } = await adminClient
    .from('project_slots')
    .select('id, assigned_company_id, status, fulfillment_type')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (slotsError) {
    throw new Error(`Failed to load project slots: ${slotsError.message}`);
  }

  const requiredSlots = (slots ?? []) as Array<{
    id: string;
    assigned_company_id: string | null;
    status: string | null;
    fulfillment_type: string | null;
  }>;
  if (requiredSlots.length === 0) return true;

  const externalSlotsReady = requiredSlots
    .filter((slot) => slot.fulfillment_type === 'external')
    .every((slot) => ['filled', 'scheduled'].includes(slot.status ?? ''));
  if (!externalSlotsReady) return false;

  const quoteRequiredSlots = requiredSlots.filter((slot) => slot.fulfillment_type !== 'external');
  if (quoteRequiredSlots.length === 0) return true;

  const allSlotsAssigned = quoteRequiredSlots.every((slot) => (
    !!slot.assigned_company_id && ['filled', 'scheduled'].includes(slot.status ?? '')
  ));
  if (!allSlotsAssigned) return false;

  const requiredCompanyIds = quoteRequiredSlots
    .map((slot) => slot.assigned_company_id)
    .filter((id): id is string => Boolean(id));

  const approvedQuoteResult = await adminClient
    .from('quotes')
    .select('slot_id, company_id')
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .in('company_id', requiredCompanyIds);

  if (isMissingColumnError(approvedQuoteResult.error)) {
    const legacyQuoteResult = await adminClient
      .from('quotes')
      .select('company_id')
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .in('company_id', requiredCompanyIds);

    if (legacyQuoteResult.error) {
      throw new Error(`Failed to load approved slot quotes: ${legacyQuoteResult.error.message}`);
    }

    const approvedCompanyIds = new Set(
      ((legacyQuoteResult.data ?? []) as Array<{ company_id: string | null }>)
        .map((quote) => quote.company_id)
        .filter((id): id is string => Boolean(id))
    );

    return quoteRequiredSlots.every((slot) => (
      !!slot.assigned_company_id && approvedCompanyIds.has(slot.assigned_company_id)
    ));
  }

  if (approvedQuoteResult.error) {
    throw new Error(`Failed to load approved slot quotes: ${approvedQuoteResult.error.message}`);
  }

  const quotes = (approvedQuoteResult.data ?? []) as Array<{ slot_id: string | null; company_id: string | null }>;
  const approvedSlotIds = new Set(quotes.map((quote) => quote.slot_id).filter((id): id is string => Boolean(id)));
  const companySlotCounts = quoteRequiredSlots.reduce<Record<string, number>>((counts, slot) => {
    if (slot.assigned_company_id) counts[slot.assigned_company_id] = (counts[slot.assigned_company_id] ?? 0) + 1;
    return counts;
  }, {});
  const legacyApprovedCompanyIds = new Set(
    quotes
      .filter((quote) => !quote.slot_id && quote.company_id && companySlotCounts[quote.company_id] === 1)
      .map((quote) => quote.company_id as string)
  );

  return quoteRequiredSlots.every((slot) => (
    approvedSlotIds.has(slot.id)
    || (!!slot.assigned_company_id && legacyApprovedCompanyIds.has(slot.assigned_company_id))
  ));
}

async function allApprovedProjectMilestonesReleased(
  adminClient: ReturnType<typeof createClient>,
  projectId: string
): Promise<boolean> {
  const allSlotCompaniesFunded = await allFilledSlotsHaveApprovedQuotes(adminClient, projectId);
  if (!allSlotCompaniesFunded) return false;

  const { data: approvedQuotes, error: quoteError } = await adminClient
    .from('quotes')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'approved');

  if (quoteError) {
    throw new Error(`Failed to load approved project quotes: ${quoteError.message}`);
  }

  const quoteIds = (approvedQuotes ?? []).map((quote: { id: string }) => quote.id);
  if (quoteIds.length === 0) return false;

  const { data: projectMilestones, error: milestoneError } = await adminClient
    .from('milestones')
    .select('id, status')
    .in('quote_id', quoteIds);

  if (milestoneError) {
    throw new Error(`Failed to load approved project milestones: ${milestoneError.message}`);
  }

  const milestones = (projectMilestones ?? []) as Array<{ id: string; status: string }>;
  return milestones.length > 0
    && milestones.every((m) => m.status === 'paid' || m.status === 'homeowner_approved');
}
