import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function assertStripePayoutReady(stripeAccountId: string | null): Promise<void> {
  if (!stripeAccountId) {
    throw new Error('Connect Stripe payouts before accepting jobs');
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    throw new Error('Stripe payouts are not configured');
  }

  const stripe = new Stripe(stripeSecretKey);
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const transfersActive = account.capabilities?.transfers === 'active';

  if (!account.details_submitted || !account.payouts_enabled || !transfersActive) {
    throw new Error('Finish Stripe payout onboarding before accepting jobs');
  }
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
    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .select('id, user_id, verified, stripe_account_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (companyError || !company || !company.verified) {
      return new Response(
        JSON.stringify({ error: 'Only verified companies can accept jobs' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      await assertStripePayoutReady(company.stripe_account_id);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Finish Stripe payout onboarding before accepting jobs' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

      // Load slot + project details
      const { data: slot, error: slotError } = await adminClient
        .from('project_slots')
        .select('id, trade_type, project_id, projects(homeowner_id, status, scheduling_status, ai_cost_min, ai_cost_max)')
        .eq('id', slot_id)
        .single();

      if (slotError || !slot) {
        warnings.push(`Slot accepted but details could not be loaded: ${slotError?.message ?? 'missing slot'}`);
      }

      const proj = firstJoinedRow(
        slot?.projects as
          | { homeowner_id: string; status: string; scheduling_status: string; ai_cost_min: number; ai_cost_max: number }
          | { homeowner_id: string; status: string; scheduling_status: string; ai_cost_min: number; ai_cost_max: number }[]
          | null
          | undefined
      );

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
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('homeowner_id, address, city, room_type, ai_cost_min, ai_cost_max')
      .eq('id', project_id)
      .single();
    if (projectError || !project) {
      warnings.push(`Job accepted but project details could not be loaded: ${projectError?.message ?? 'missing project'}`);
    }

    // Auto-create a quote at the AI price with standard milestones + line items
    if (project?.ai_cost_min && project?.ai_cost_max) {
      const avgCost = Math.round((project.ai_cost_min + project.ai_cost_max) / 2);
      const deposit    = Math.round(avgCost * 0.30);
      const midpoint   = Math.round(avgCost * 0.30);
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
        needs_quote: warnings.some((warning) => warning.includes('quote') || warning.includes('milestone')),
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
