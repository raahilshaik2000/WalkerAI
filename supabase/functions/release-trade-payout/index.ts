import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
  companyId: string,
  readiness: ReturnType<typeof stripeReadiness> & { stripe_account_id: string },
) {
  const result = await adminClient.from('companies').update(readiness).eq('id', companyId);
  if (!isMissingColumnError(result.error)) {
    if (result.error) throw result.error;
    return;
  }
  const fallback = await adminClient
    .from('companies')
    .update({ stripe_account_id: readiness.stripe_account_id })
    .eq('id', companyId);
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
  await updateStripeReadiness(adminClient, companyId, readiness);

  if (!readiness.stripe_details_submitted || !readiness.stripe_payouts_enabled || !readiness.stripe_transfers_active) {
    throw new Error('Contractor must finish Stripe payout onboarding before payment can be released');
  }
}

// Trade completion proof. Photos live in project-photos at {projectId}/slots/{slotId}/…;
// the messages fallback mirrors the milestone flow for environments missing the
// company progress-photo RLS policy.
async function hasSlotCompletionEvidence(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
  slotId: string,
): Promise<boolean> {
  const [photoResult, messageResult] = await Promise.all([
    adminClient
      .from('project_photos')
      .select('id')
      .eq('project_id', projectId)
      .like('storage_path', `${projectId}/slots/${slotId}/%`)
      .limit(1),
    adminClient
      .from('messages')
      .select('id')
      .eq('project_id', projectId)
      .not('attachment_url', 'is', null)
      .ilike('body', `%slot:${slotId}%`)
      .limit(1),
  ]);

  if (photoResult.error) {
    throw new Error(`Failed to verify trade completion photos: ${photoResult.error.message}`);
  }
  if (messageResult.error) {
    throw new Error(`Failed to verify trade completion messages: ${messageResult.error.message}`);
  }
  return (photoResult.data?.length ?? 0) > 0 || (messageResult.data?.length ?? 0) > 0;
}

async function getHSTRate(adminClient: ReturnType<typeof createClient>, province: string): Promise<number> {
  const { data } = await adminClient.rpc('canadian_tax_rate', { province_code: province });
  return (data as number) ?? 0.05;
}

// True once every required slot in the project has had its payout released.
async function allTradePayoutsReleased(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  const { data: slots, error } = await adminClient
    .from('project_slots')
    .select('id, payout_status')
    .eq('project_id', projectId);
  if (error) throw new Error(`Failed to load project slots: ${error.message}`);

  const rows = (slots ?? []) as Array<{ payout_status: string | null }>;
  return rows.length > 0 && rows.every((slot) => slot.payout_status === 'paid');
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
  user_id: string; verified: true; business_name: string; city: string; province: string;
  lat: number; lng: number; license_number: string; license_doc_url: string; insurance_doc_url: string;
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

// GC-managed projects keep the dedicated homeowner completion-approval step, so we
// don't auto-complete here. Mirrors release-milestone's gate.
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
  if (error) throw new Error(`Failed to check GC project management status: ${error.message}`);

  const rows = (data ?? []) as Array<{ general_contractors?: unknown }>;
  for (const row of rows) {
    const gc = Array.isArray(row.general_contractors)
      ? row.general_contractors[0] ?? null
      : (row.general_contractors as Parameters<typeof hasCompleteGcCompletionProfile>[0]) ?? null;
    if (!hasCompleteGcCompletionProfile(gc)) continue;

    const { data: appUser, error: appUserError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', gc.user_id)
      .maybeSingle();
    if (appUserError) throw new Error(`Failed to check GC account role: ${appUserError.message}`);
    if (appUser?.role === 'general_contractor') return true;
  }
  return false;
}

async function completeProjectAndNotify(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
  homeownerId: string,
  fallbackCompanyUserId: string,
) {
  const { error: projectUpdateError } = await adminClient
    .from('projects')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', projectId);
  if (projectUpdateError) {
    throw new Error(`Final trade payout released but project completion update failed: ${projectUpdateError.message}`);
  }

  const companyUserIds = new Set<string>();
  if (fallbackCompanyUserId) companyUserIds.add(fallbackCompanyUserId);

  const { data: assignedSlots, error: assignedSlotsError } = await adminClient
    .from('project_slots')
    .select('companies(user_id)')
    .eq('project_id', projectId)
    .not('assigned_company_id', 'is', null);
  if (assignedSlotsError) {
    console.warn('Project completed but assigned company lookup failed:', assignedSlotsError.message);
  } else {
    for (const row of assignedSlots ?? []) {
      const company = Array.isArray((row as { companies: unknown }).companies)
        ? (row as { companies: Array<{ user_id: string }> }).companies[0]
        : (row as { companies: { user_id: string } | null }).companies;
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

  const { error: notificationError } = await adminClient.from('notifications').insert(notifications);
  if (notificationError) {
    console.warn('Project completed but review notifications failed:', notificationError.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

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
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: requesterAppUser, error: requesterRoleError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (requesterRoleError) throw requesterRoleError;
    if (requesterAppUser?.role !== 'homeowner') return jsonResponse({ error: 'Forbidden' }, 403);

    const { slot_id } = await req.json();
    if (!slot_id) return jsonResponse({ error: 'slot_id is required' }, 400);

    // Load the slot with project + assigned company context.
    const { data: slot, error: slotError } = await adminClient
      .from('project_slots')
      .select(`
        id, trade_type, status, payout_cents, payout_status, completion_submitted_at,
        stripe_transfer_id, estimated_cost_min, estimated_cost_max, assigned_company_id, work_order,
        project:projects ( id, homeowner_id, status, payment_model, payment_status, admin_paused ),
        company:companies ( id, user_id, stripe_account_id, province )
      `)
      .eq('id', slot_id)
      .single();

    if (slotError || !slot) return jsonResponse({ error: 'Trade slot not found' }, 404);

    const project = (Array.isArray(slot.project) ? slot.project[0] : slot.project) as {
      id: string; homeowner_id: string; status: string;
      payment_model: string | null; payment_status: string | null;
      admin_paused?: boolean | null;
    } | null;
    const company = (Array.isArray(slot.company) ? slot.company[0] : slot.company) as {
      id: string; user_id: string; stripe_account_id: string | null; province: string | null;
    } | null;

    if (!project || !company) {
      return jsonResponse({ error: 'Trade slot context is incomplete' }, 404);
    }

    // This function only serves master-model, funded projects.
    if (project.payment_model !== 'master') {
      return jsonResponse({ error: 'This project does not use the master-payment model' }, 400);
    }
    if (project.payment_status !== 'funded') {
      return jsonResponse({ error: 'Project must be paid before trade payouts can be released' }, 400);
    }

    // Only the homeowner can release.
    if (project.homeowner_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    if (project.admin_paused) {
      return jsonResponse({
        error: 'Payment release is restricted by Walker AI admin. Contact support to release the hold.',
      }, 400);
    }

    // No release while a dispute is active on the project.
    const { data: dispute, error: disputeError } = await adminClient
      .from('disputes')
      .select('id')
      .eq('project_id', project.id)
      .in('status', ['open', 'under_review'])
      .limit(1)
      .maybeSingle();
    if (disputeError) throw new Error(`Failed to check project disputes: ${disputeError.message}`);
    if (dispute) {
      return jsonResponse({ error: 'Cannot release payment while a dispute is active' }, 400);
    }

    const payoutCents = slot.payout_cents as number | null;

    // Idempotency — already released.
    if (slot.payout_status === 'paid' || slot.stripe_transfer_id) {
      const isFinalTrade = await allTradePayoutsReleased(adminClient, project.id);
      const gcCompletionApprovalRequired = isFinalTrade && await hasActiveGcManagement(adminClient, project.id);
      if (isFinalTrade && project.status !== 'completed' && !gcCompletionApprovalRequired) {
        await completeProjectAndNotify(adminClient, project.id, project.homeowner_id, company.user_id);
      }
      return jsonResponse({
        success: true,
        already_released: true,
        transfer_id: slot.stripe_transfer_id,
        is_final_trade: isFinalTrade,
        gc_completion_approval_required: gcCompletionApprovalRequired,
      });
    }

    // Sequential trades: every earlier-ordered trade must be paid before this one.
    const workOrder = slot.work_order as number | null;
    if (workOrder != null) {
      const { data: priorSlots, error: priorError } = await adminClient
        .from('project_slots')
        .select('id, payout_status')
        .eq('project_id', project.id)
        .lt('work_order', workOrder);
      if (priorError) throw priorError;
      const blocking = (priorSlots ?? []).filter(
        (s: { payout_status: string | null }) => s.payout_status !== 'paid'
      );
      if (blocking.length > 0) {
        return jsonResponse(
          { error: 'Earlier trades must finish and be paid before this trade can be released.' },
          409,
        );
      }
    }

    // Payout must have been locked at acceptance.
    if (!Number.isFinite(payoutCents) || (payoutCents ?? 0) <= 0) {
      return jsonResponse({ error: 'This trade has no locked payout amount' }, 400);
    }

    // Contractor must have marked the trade complete with photo proof.
    if (!slot.completion_submitted_at) {
      return jsonResponse({ error: 'Contractor must mark this trade complete before approval' }, 400);
    }
    const hasEvidence = await hasSlotCompletionEvidence(adminClient, project.id, slot_id);
    if (!hasEvidence) {
      return jsonResponse({ error: 'Completion photo evidence is required before payment can be released' }, 400);
    }

    try {
      await assertStripePayoutReady(stripe, adminClient, company.id, company.stripe_account_id);
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Contractor has not completed Stripe onboarding' }, 400);
    }

    const transferAmount = payoutCents as number;

    // Transfer the locked payout from the platform balance to the company.
    // No commission math here — WalkerAI's margin was already removed when the
    // payout was locked at acceptance (master_total − Σ payouts).
    const transfer = await stripe.transfers.create(
      {
        amount: transferAmount,
        currency: 'cad',
        destination: company.stripe_account_id!,
        transfer_group: `project_${project.id}`,
        metadata: {
          project_id: project.id,
          slot_id,
          company_id: company.id,
          payout_kind: 'trade',
        },
        description: `WalkerAI Trade Payout — ${String(slot.trade_type ?? 'trade').replace(/_/g, ' ')}`,
      },
      { idempotencyKey: `trade-payout-${slot_id}` }
    );

    // Mark the slot paid. Conditional on no existing transfer for idempotency.
    const { data: paidSlot, error: slotUpdateError } = await adminClient
      .from('project_slots')
      .update({
        payout_status: 'paid',
        approved_at: new Date().toISOString(),
        stripe_transfer_id: transfer.id,
      })
      .eq('id', slot_id)
      .is('stripe_transfer_id', null)
      .select('id')
      .maybeSingle();
    if (slotUpdateError) {
      throw new Error(`Transfer created but slot payout update failed: ${slotUpdateError.message}`);
    }
    if (!paidSlot) {
      // Another release won the race; the transfer is idempotent so this is safe.
      console.warn(`Slot ${slot_id} payout was already recorded by a concurrent release.`);
    }

    // Notify the company.
    const { error: companyNotificationError } = await adminClient.from('notifications').insert({
      user_id: company.user_id,
      type: 'trade_payout_paid',
      payload: {
        project_id: project.id,
        slot_id,
        trade_type: slot.trade_type,
        amount: transferAmount,
        deep_link: `/(company)/job/${project.id}`,
      },
    });
    if (companyNotificationError) {
      console.warn('Trade payout released but company notification failed:', companyNotificationError.message);
    }

    // Complete the project once every trade has been paid out.
    const isFinalTrade = await allTradePayoutsReleased(adminClient, project.id);
    const gcCompletionApprovalRequired = isFinalTrade && await hasActiveGcManagement(adminClient, project.id);
    if (isFinalTrade && !gcCompletionApprovalRequired) {
      await completeProjectAndNotify(adminClient, project.id, project.homeowner_id, company.user_id);
    } else if (!isFinalTrade) {
      // Sequential flow: this payout unlocks the next trade — tell its company
      // they can start. The next active trade is the lowest-ordered unpaid slot.
      const { data: nextSlot, error: nextSlotError } = await adminClient
        .from('project_slots')
        .select('id, trade_type, work_order, companies(user_id)')
        .eq('project_id', project.id)
        .neq('payout_status', 'paid')
        .not('work_order', 'is', null)
        .order('work_order', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (nextSlotError) {
        console.warn('Trade paid but next-trade lookup failed:', nextSlotError.message);
      } else if (nextSlot) {
        const nextCompany = Array.isArray(nextSlot.companies)
          ? nextSlot.companies[0]
          : nextSlot.companies as { user_id: string } | null;
        if (nextCompany?.user_id) {
          const { error: nextNotifyError } = await adminClient.from('notifications').insert({
            user_id: nextCompany.user_id,
            type: 'trade_turn_started',
            payload: {
              project_id: project.id,
              slot_id: nextSlot.id,
              trade_type: nextSlot.trade_type,
              message: 'The previous trade is complete — you can start your work now.',
              deep_link: `/(company)/job/${project.id}`,
            },
          });
          if (nextNotifyError) console.warn('Next-trade turn notification failed:', nextNotifyError.message);
        }
      }
    }

    // Implicit margin + HST for bookkeeping (WalkerAI owes HST on its margin).
    const avgEstimate = (slot.estimated_cost_min != null && slot.estimated_cost_max != null)
      ? Math.round(((slot.estimated_cost_min as number) + (slot.estimated_cost_max as number)) / 2)
      : transferAmount;
    const marginAmount = Math.max(0, avgEstimate - transferAmount);
    const hstRate = await getHSTRate(adminClient, company.province ?? '');
    const hstOnMargin = Math.round(marginAmount * hstRate);

    return jsonResponse({
      success: true,
      transfer_id: transfer.id,
      transfer_amount_cad_cents: transferAmount,
      margin_amount_cad_cents: marginAmount,
      hst_on_margin_cents: hstOnMargin,
      is_final_trade: isFinalTrade,
      gc_completion_approval_required: gcCompletionApprovalRequired,
    });

  } catch (err) {
    console.error('release-trade-payout error:', err);
    if (err instanceof Stripe.errors.StripeError) {
      return jsonResponse({ error: `Stripe error: ${err.message}` }, 400);
    }
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
