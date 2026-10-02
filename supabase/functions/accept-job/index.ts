import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StripePayoutRecord {
  stripe_account_id: string | null;
  stripe_details_submitted?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_transfers_active?: boolean | null;
}

function hasStripeReadinessFields(record: StripePayoutRecord) {
  return record.stripe_details_submitted != null
    || record.stripe_payouts_enabled != null
    || record.stripe_transfers_active != null;
}

async function assertStripePayoutReady(record: StripePayoutRecord): Promise<void> {
  if (!record.stripe_account_id) {
    throw new Error('Connect Stripe payouts before accepting jobs');
  }

  if (hasStripeReadinessFields(record)) {
    if (record.stripe_details_submitted && record.stripe_payouts_enabled && record.stripe_transfers_active) {
      return;
    }
    throw new Error('Finish Stripe payout onboarding before accepting jobs');
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    throw new Error('Stripe payouts are not configured');
  }

  const stripe = new Stripe(stripeSecretKey);
  const account = await stripe.accounts.retrieve(record.stripe_account_id);
  const transfersActive = account.capabilities?.transfers === 'active';

  if (!account.details_submitted || !account.payouts_enabled || !transfersActive) {
    throw new Error('Finish Stripe payout onboarding before accepting jobs');
  }
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message)
    || /schema cache/i.test(message);
}

function isMissingAtomicSlotRpcError(error: { message?: string; details?: string } | null | undefined) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`;
  return /atomic_accept_slot/i.test(text) && /not find|does not exist|schema cache|function/i.test(text);
}

function firstJoinedRow<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isSlotAcceptanceWindowOpen(project: { status?: string | null; dispatch_expires_at?: string | null } | null) {
  if (!project || project.status !== 'dispatching') return false;
  const expiresAt = Date.parse(project.dispatch_expires_at ?? '');
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function assertSlotAcceptanceWindowOpen(
  adminClient: ReturnType<typeof createClient>,
  slotId: string,
) {
  const { data: slot, error: slotError } = await adminClient
    .from('project_slots')
    .select('id, projects(status, dispatch_expires_at)')
    .eq('id', slotId)
    .maybeSingle();

  if (slotError) throw slotError;
  if (!slot) throw new Error('Slot is no longer available');

  const project = firstJoinedRow(
    slot.projects as
      | { status: string | null; dispatch_expires_at: string | null }
      | { status: string | null; dispatch_expires_at: string | null }[]
      | null
      | undefined
  );

  if (!isSlotAcceptanceWindowOpen(project)) {
    throw new Error('This dispatch window has expired. Wait for the homeowner to redispatch this trade.');
  }
}

async function acceptSlotWithConditionalUpdate(
  adminClient: ReturnType<typeof createClient>,
  slotId: string,
  companyId: string,
) {
  await assertSlotAcceptanceWindowOpen(adminClient, slotId);

  const { data: dispatch, error: dispatchError } = await adminClient
    .from('dispatch_logs')
    .select('id')
    .eq('slot_id', slotId)
    .eq('company_id', companyId)
    .eq('response', 'pending')
    .maybeSingle();

  if (dispatchError) throw dispatchError;
  if (!dispatch) return false;

  const { data: slot, error: slotUpdateError } = await adminClient
    .from('project_slots')
    .update({
      status: 'filled',
      assigned_company_id: companyId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', slotId)
    .in('status', ['open', 'dispatching'])
    .select('id, project_id')
    .maybeSingle();

  if (slotUpdateError) throw slotUpdateError;
  if (!slot) return false;

  const respondedAt = new Date().toISOString();
  const { error: acceptedDispatchError } = await adminClient
    .from('dispatch_logs')
    .update({ response: 'accepted', responded_at: respondedAt })
    .eq('slot_id', slotId)
    .eq('company_id', companyId)
    .eq('response', 'pending');
  if (acceptedDispatchError) throw acceptedDispatchError;

  const { error: filledDispatchError } = await adminClient
    .from('dispatch_logs')
    .update({ response: 'filled', responded_at: respondedAt })
    .eq('slot_id', slotId)
    .neq('company_id', companyId)
    .eq('response', 'pending');
  if (filledDispatchError) throw filledDispatchError;

  const { data: remainingSlots, error: remainingSlotsError } = await adminClient
    .from('project_slots')
    .select('id')
    .eq('project_id', slot.project_id)
    .not('status', 'in', '(filled,scheduled)');

  if (remainingSlotsError) throw remainingSlotsError;

  if ((remainingSlots ?? []).length === 0) {
    const { error: projectUpdateError } = await adminClient
      .from('projects')
      .update({ status: 'scheduling', scheduling_status: 'pending_homeowner' })
      .eq('id', slot.project_id);
    if (projectUpdateError) throw projectUpdateError;
  }

  return true;
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

  // User-scoped client (respects RLS, verifies JWT)
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Service role client for privileged operations (notifications, cross-table writes)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Verify caller identity
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { project_id, slot_id } = body as { project_id?: string; slot_id?: string };
    const warnings: string[] = [];

    // Verify caller is a verified company
    let companyResult = await adminClient
      .from('companies')
      .select('id, user_id, verified, stripe_account_id, stripe_details_submitted, stripe_payouts_enabled, stripe_transfers_active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isMissingColumnError(companyResult.error)) {
      companyResult = await adminClient
        .from('companies')
        .select('id, user_id, verified, stripe_account_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    const { data: company, error: companyError } = companyResult;

    if (companyError || !company || !company.verified) {
      return new Response(
        JSON.stringify({ error: 'Only verified companies can accept jobs' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      await assertStripePayoutReady(company);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Finish Stripe payout onboarding before accepting jobs' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (project_id || slot_id) {
      let holdProjectId = typeof project_id === 'string' ? project_id : null;
      if (!holdProjectId && slot_id) {
        const { data: slotRow, error: slotLookupError } = await adminClient
          .from('project_slots')
          .select('project_id')
          .eq('id', slot_id)
          .maybeSingle();
        if (slotLookupError) throw slotLookupError;
        holdProjectId = (slotRow as { project_id?: string } | null)?.project_id ?? null;
      }
      if (holdProjectId) {
        let holdResult = await adminClient
          .from('projects')
          .select('admin_paused')
          .eq('id', holdProjectId)
          .maybeSingle();
        if (holdResult.error && isMissingColumnError(holdResult.error)) {
          holdResult = { data: null, error: null } as typeof holdResult;
        } else if (holdResult.error) {
          throw holdResult.error;
        }
        if (holdResult.data?.admin_paused) {
          return new Response(
            JSON.stringify({
              error: 'This project is on admin hold. Contact Walker AI support before accepting.',
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    // ── Slot-based acceptance (new trade-slot flow) ──────────────
    if (slot_id) {
      try {
        await assertSlotAcceptanceWindowOpen(adminClient, slot_id);
      } catch (windowError) {
        return new Response(
          JSON.stringify({ error: windowError instanceof Error ? windowError.message : 'This dispatch window has expired' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: rpcAccepted, error: acceptError } = await adminClient.rpc('atomic_accept_slot', {
        p_slot_id: slot_id,
        p_company_id: company.id,
      });

      let accepted = !!rpcAccepted;
      if (acceptError) {
        if (isMissingAtomicSlotRpcError(acceptError)) {
          accepted = await acceptSlotWithConditionalUpdate(adminClient, slot_id, company.id);
        } else {
          const isLockError = acceptError.message?.includes('lock');
          return new Response(
            JSON.stringify({
              error: isLockError ? 'Slot is currently being claimed — please try again.' : acceptError.message,
              code: 'RACE_CONDITION',
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (!accepted) {
        return new Response(
          JSON.stringify({ error: 'Slot is no longer available', code: 'SLOT_FILLED' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Load slot + project details (incl. estimate + margin to lock the trade payout)
      let slotResult = await adminClient
        .from('project_slots')
        .select('id, trade_type, project_id, estimated_cost_min, estimated_cost_max, projects(homeowner_id, status, scheduling_status, ai_cost_min, ai_cost_max, payment_model, platform_margin_pct)')
        .eq('id', slot_id)
        .single();
      if (isMissingColumnError(slotResult.error)) {
        // Pre-migration fallback: master-quote columns not present yet.
        slotResult = await adminClient
          .from('project_slots')
          .select('id, trade_type, project_id, estimated_cost_min, estimated_cost_max, projects(homeowner_id, status, scheduling_status, ai_cost_min, ai_cost_max)')
          .eq('id', slot_id)
          .single();
      }
      const { data: slot, error: slotError } = slotResult;

      if (slotError || !slot) {
        warnings.push(`Slot accepted but details could not be loaded: ${slotError?.message ?? 'missing slot'}`);
      }

      const proj = firstJoinedRow(
        slot?.projects as
          | { homeowner_id: string; status: string; scheduling_status: string; ai_cost_min: number; ai_cost_max: number; payment_model?: string; platform_margin_pct?: number }
          | { homeowner_id: string; status: string; scheduling_status: string; ai_cost_min: number; ai_cost_max: number; payment_model?: string; platform_margin_pct?: number }[]
          | null
          | undefined
      );

      // Lock the per-trade payout at acceptance (master-quote model, D1/D2).
      // payout = avg(AI slot estimate) * (1 - platform margin); WalkerAI's margin
      // is the implicit gap. Legacy (fenced) projects keep the old quote path.
      if (proj && (proj.payment_model ?? 'master') === 'master') {
        const minCost = (slot as { estimated_cost_min?: number | null } | null)?.estimated_cost_min;
        const maxCost = (slot as { estimated_cost_max?: number | null } | null)?.estimated_cost_max;
        const marginPct = typeof proj.platform_margin_pct === 'number' ? proj.platform_margin_pct : 0.10;
        if (minCost != null && maxCost != null) {
          // Canonical formula: src/lib/master-quote.ts computeTradePayoutCents (unit-tested).
          const payoutCents = Math.round(((minCost + maxCost) / 2) * (1 - marginPct));
          const { error: payoutError } = await adminClient
            .from('project_slots')
            .update({ payout_cents: payoutCents })
            .eq('id', slot_id)
            .is('payout_cents', null); // lock once; never overwrite an existing payout
          if (payoutError) {
            warnings.push(
              isMissingColumnError(payoutError)
                ? 'Slot accepted but payout could not be locked yet (master-quote migration pending).'
                : `Slot accepted but payout lock failed: ${payoutError.message}`
            );
          }
        } else {
          warnings.push('Slot accepted but AI estimate is missing; trade payout not locked.');
        }
      }

      if (proj) {
        // Notify homeowner about this slot being filled
        const { error: slotNotificationError } = await adminClient.from('notifications').insert({
          user_id: proj.homeowner_id,
          type: 'slot_accepted',
          payload: {
            slot_id,
            project_id: slot?.project_id,
            trade_type: slot?.trade_type,
            company_id: company.id,
            message: `A ${slot?.trade_type?.replace(/_/g, ' ')} contractor has joined your project.`,
            deep_link: `/(homeowner)/project/${slot?.project_id}`,
          },
        });
        if (slotNotificationError) {
          warnings.push(`Slot accepted but homeowner notification failed: ${slotNotificationError.message}`);
        }

        // If ALL slots are now filled (project moved to 'scheduling'), notify homeowner to schedule
        if (proj.status === 'scheduling' && proj.scheduling_status === 'pending_homeowner') {
          const { error: allSlotsNotificationError } = await adminClient.from('notifications').insert({
            user_id: proj.homeowner_id,
            type: 'all_slots_filled',
            payload: {
              project_id: slot?.project_id,
              message: 'All trades have been assigned! Review the schedule and confirm start dates.',
              deep_link: `/(homeowner)/project/${slot?.project_id}/schedule`,
            },
          });
        if (allSlotsNotificationError) {
            warnings.push(`All slots filled but schedule notification failed: ${allSlotsNotificationError.message}`);
          }
        }

        const { data: otherDispatches, error: otherDispatchesError } = await adminClient
          .from('dispatch_logs')
          .select('companies(user_id)')
          .eq('slot_id', slot_id)
          .eq('response', 'filled');
        if (otherDispatchesError) {
          warnings.push(`Slot accepted but filled dispatches could not be loaded: ${otherDispatchesError.message}`);
        }

        const filledNotifications = (otherDispatches ?? [])
          .map((d: { companies: { user_id: string } | { user_id: string }[] }) => {
            const companyData = Array.isArray(d.companies) ? d.companies[0] : d.companies;
            return companyData?.user_id;
          })
          .filter((uid: string | undefined): uid is string => Boolean(uid))
          .map((uid: string) => ({
            user_id: uid,
            type: 'job_filled',
            payload: {
              project_id: slot?.project_id,
              slot_id,
              trade_type: slot?.trade_type,
              message: 'Another contractor accepted this trade slot.',
              deep_link: '/(company)',
            },
          }));

        if (filledNotifications.length > 0) {
          const { error: filledNotificationError } = await adminClient.from('notifications').insert(filledNotifications);
          if (filledNotificationError) {
            warnings.push(`Slot accepted but filled notifications failed: ${filledNotificationError.message}`);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, slot_id, company_id: company.id, warnings }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Legacy single-contractor acceptance ──────────────────────
    if (!project_id) {
      return new Response(
        JSON.stringify({ error: 'project_id or slot_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the atomic_accept_job PostgreSQL function
    const { data: accepted, error: acceptError } = await adminClient.rpc('atomic_accept_job', {
      p_project_id: project_id,
      p_company_id: company.id,
    });

    if (acceptError) {
      const isLockError = acceptError.message?.includes('lock');
      return new Response(
        JSON.stringify({
          error: isLockError ? 'Job is currently being claimed — please try again.' : acceptError.message,
          code: 'RACE_CONDITION',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!accepted) {
      return new Response(
        JSON.stringify({ error: 'Job is no longer available', code: 'JOB_FILLED' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Job accepted successfully — load project details
    let projectResult = await adminClient
      .from('projects')
      .select('homeowner_id, address, city, room_type, ai_cost_min, ai_cost_max, payment_model')
      .eq('id', project_id)
      .single();
    if (isMissingColumnError(projectResult.error)) {
      // Pre-migration fallback: payment_model column not present yet.
      projectResult = await adminClient
        .from('projects')
        .select('homeowner_id, address, city, room_type, ai_cost_min, ai_cost_max')
        .eq('id', project_id)
        .single();
    }
    const { data: project, error: projectError } = projectResult;
    if (projectError || !project) {
      warnings.push(`Job accepted but project details could not be loaded: ${projectError?.message ?? 'missing project'}`);
    }

    // Auto-create a quote at the AI price with standard milestones + line items.
    // Master-quote projects (D4) skip this entirely — they pay one master PI and
    // settle per-trade payouts; only legacy projects keep the per-quote path.
    const isMasterModel = (project as { payment_model?: string } | null)?.payment_model === 'master';
    let autoQuoteCreated = false;
    if (isMasterModel) {
      // No auto-quote for master-model projects; payout is handled per-trade.
    } else if (project?.ai_cost_min && project?.ai_cost_max) {
      const avgCost = Math.round((project.ai_cost_min + project.ai_cost_max) / 2);
      const deposit    = Math.round(avgCost * 0.30);
      const midpoint   = Math.round(avgCost * 0.40);
      const completion = avgCost - deposit - midpoint;

      const { data: quote, error: quoteError } = await adminClient
        .from('quotes')
        .insert({
          project_id,
          company_id: company.id,
          total_amount: avgCost,
          status: 'pending',
          commission_rate: 0.10,
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (quoteError || !quote?.id) {
        warnings.push(`Job accepted but automatic quote creation failed: ${quoteError?.message ?? 'missing quote id'}`);
      } else {
        autoQuoteCreated = true;
        const { error: milestoneError } = await adminClient.from('milestones').insert([
          { quote_id: quote.id, title: 'Project Deposit',    amount: deposit,    sort_order: 1, status: 'pending' },
          { quote_id: quote.id, title: 'Mid-Project',        amount: midpoint,   sort_order: 2, status: 'pending' },
          { quote_id: quote.id, title: 'Final Completion',   amount: completion, sort_order: 3, status: 'pending' },
        ]);
        if (milestoneError) {
          warnings.push(`Quote created but milestone creation failed: ${milestoneError.message}`);
        }

        // Populate quote line items from scope (labour) and materials
        const [{ data: scope, error: scopeError }, { data: mats, error: matsError }] = await Promise.all([
          adminClient.from('scope_of_work').select('phase, description').eq('project_id', project_id).order('sort_order'),
          adminClient.from('materials').select('item, quantity, unit, quality_tier').eq('project_id', project_id),
        ]);
        if (scopeError) warnings.push(`Quote created but scope line items could not be loaded: ${scopeError.message}`);
        if (matsError) warnings.push(`Quote created but material line items could not be loaded: ${matsError.message}`);

        const quoteSummaryLineItem = {
          quote_id: quote.id,
          type: 'other',
          description: 'WalkerAI AI estimate package',
          quantity: 1,
          unit_cost: avgCost,
          total_cost: avgCost,
          sort_order: 1,
        };

        const lineItems = [
          quoteSummaryLineItem,
          ...(scope ?? []).map((s: { phase: string; description: string }, i: number) => ({
            quote_id: quote.id,
            type: 'labour',
            description: `[${s.phase}] ${s.description}`,
            quantity: 1,
            unit_cost: null,
            total_cost: null,
            sort_order: i + 2,
          })),
          ...(mats ?? []).map((m: { item: string; quantity: number; unit: string | null; quality_tier: string | null }, i: number) => ({
            quote_id: quote.id,
            type: 'material',
            description: m.item,
            quantity: m.quantity ?? 1,
            unit: m.unit,
            unit_cost: null,
            total_cost: null,
            sort_order: (scope?.length ?? 0) + i + 2,
          })),
        ];

        const { error: lineItemError } = await adminClient.from('quote_line_items').insert(lineItems);
        if (lineItemError) {
          warnings.push(`Quote created but line item creation failed: ${lineItemError.message}`);
        }
      }
    } else {
      warnings.push('Job accepted but project AI budget is missing; manual quote is required.');
    }

    if (project) {
      const { error: homeownerNotificationError } = await adminClient.from('notifications').insert({
        user_id: project.homeowner_id,
        type: 'job_accepted',
        payload: {
          project_id,
          company_id: company.id,
          message: 'A contractor has accepted your project!',
          deep_link: `/(homeowner)/project/${project_id}`,
        },
      });
      if (homeownerNotificationError) {
        warnings.push(`Job accepted but homeowner notification failed: ${homeownerNotificationError.message}`);
      }

      const { data: otherDispatches, error: otherDispatchesError } = await adminClient
        .from('dispatch_logs')
        .select('companies(user_id)')
        .eq('project_id', project_id)
        .eq('response', 'filled');
      if (otherDispatchesError) {
        warnings.push(`Job accepted but filled dispatches could not be loaded: ${otherDispatchesError.message}`);
      }

      const filledNotifications = (otherDispatches ?? [])
        .map((d: { companies: { user_id: string } | { user_id: string }[] }) => {
          const companyData = Array.isArray(d.companies) ? d.companies[0] : d.companies;
          return companyData?.user_id;
        })
        .filter((uid: string | undefined): uid is string => Boolean(uid))
        .map((uid: string) => ({
          user_id: uid,
          type: 'job_filled',
          payload: {
            project_id,
            message: 'Another contractor accepted this job.',
            deep_link: '/(company)',
          },
        }));

      if (filledNotifications.length > 0) {
        const { error: filledNotificationError } = await adminClient.from('notifications').insert(filledNotifications);
        if (filledNotificationError) {
          warnings.push(`Job accepted but filled notifications failed: ${filledNotificationError.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        project_id,
        company_id: company.id,
        warnings,
        needs_quote: !isMasterModel && (!autoQuoteCreated || warnings.some((warning) => warning.includes('quote') || warning.includes('milestone'))),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('accept-job error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
