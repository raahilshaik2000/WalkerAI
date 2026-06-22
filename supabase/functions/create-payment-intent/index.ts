import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message)
    || /schema cache/i.test(message);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getOrCreateStripeCustomer(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  user: { id: string; email?: string | null },
): Promise<string> {
  const { data: userData, error: userError } = await adminClient
    .from('users')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single();
  if (userError) throw userError;

  const existing = (userData as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: (userData as { email?: string | null } | null)?.email ?? user.email ?? undefined,
    metadata: { supabase_user_id: user.id },
  });
  const { error: customerUpdateError } = await adminClient
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id);
  if (customerUpdateError) throw customerUpdateError;
  return customer.id;
}

interface MasterProject {
  id: string;
  homeowner_id: string;
  payment_status?: string | null;
  master_total_cents?: number | null;
  master_payment_intent_id?: string | null;
  ai_cost_min?: number | null;
  ai_cost_max?: number | null;
}

// Master-quote model: one PaymentIntent for the whole project, captured to the
// WalkerAI platform balance (escrow). No per-trade quotes. Homeowner can pay only
// once every required slot is filled. Per-trade payouts are released later via
// release-trade-payout. WalkerAI's margin is the implicit master − Σ(payouts) gap.
async function handleMasterPaymentIntent(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  user: { id: string; email?: string | null },
  project: MasterProject,
): Promise<Response> {
  if (project.homeowner_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }
  if (project.payment_status === 'funded') {
    return jsonResponse({ error: 'This project has already been paid' }, 409);
  }

  // Gate: every required slot must be filled/scheduled and assigned.
  const { data: slots, error: slotsError } = await adminClient
    .from('project_slots')
    .select('id, status, assigned_company_id, payout_cents')
    .eq('project_id', project.id);
  if (slotsError) throw slotsError;

  const required = (slots ?? []) as Array<{
    status: string | null;
    assigned_company_id: string | null;
    payout_cents: number | null;
  }>;
  if (required.length === 0) {
    return jsonResponse({ error: 'No trades to pay for yet' }, 400);
  }
  const allFilled = required.every(
    (slot) => !!slot.assigned_company_id && ['filled', 'scheduled'].includes(slot.status ?? '')
  );
  if (!allFilled) {
    return jsonResponse({ error: 'All trades must accept before you can pay.' }, 400);
  }

  // Master total = homeowner price (avg AI estimate), floored at Σ(trade payouts)
  // so WalkerAI never charges less than it pays out. Reuse a previously computed
  // total if one is already locked on the project.
  // Canonical formula: src/lib/master-quote.ts computeMasterTotalCents (unit-tested).
  const base = (project.ai_cost_min != null && project.ai_cost_max != null)
    ? Math.round((project.ai_cost_min + project.ai_cost_max) / 2)
    : 0;
  const sumPayouts = required.reduce((sum, slot) => sum + (slot.payout_cents ?? 0), 0);
  let masterTotal = (project.master_total_cents && project.master_total_cents > 0)
    ? project.master_total_cents
    : Math.max(base, sumPayouts);
  if (masterTotal < sumPayouts) masterTotal = sumPayouts;
  if (!Number.isFinite(masterTotal) || masterTotal <= 0) {
    return jsonResponse({ error: 'Project total is unavailable; cannot start payment.' }, 400);
  }

  const customerId = await getOrCreateStripeCustomer(adminClient, stripe, user);
  const transferGroup = `project_${project.id}`;

  // Reuse an in-flight PI if the amount still matches.
  if (project.master_payment_intent_id) {
    const existing = await stripe.paymentIntents.retrieve(project.master_payment_intent_id);
    if (existing.status === 'succeeded') {
      return jsonResponse({ error: 'This project has already been paid' }, 409);
    }
    if (
      !['canceled', 'requires_capture'].includes(existing.status)
      && existing.amount === masterTotal
      && existing.currency === 'cad'
      && existing.client_secret
    ) {
      return jsonResponse({
        success: true,
        client_secret: existing.client_secret,
        payment_intent_id: existing.id,
        master_total_cents: masterTotal,
        reused: true,
      });
    }
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: masterTotal,
    currency: 'cad',
    customer: customerId,
    transfer_group: transferGroup,
    metadata: {
      project_id: project.id,
      homeowner_id: user.id,
      payment_kind: 'master',
    },
    description: `WalkerAI — Renovation Project ${project.id} (master)`,
  });

  // Persist the master total + PI id. Guard against a concurrent funding.
  const { data: updatedProject, error: projectUpdateError } = await adminClient
    .from('projects')
    .update({ master_total_cents: masterTotal, master_payment_intent_id: paymentIntent.id })
    .eq('id', project.id)
    .neq('payment_status', 'funded')
    .select('id')
    .maybeSingle();
  if (projectUpdateError) throw projectUpdateError;
  if (!updatedProject) {
    await stripe.paymentIntents.cancel(paymentIntent.id);
    return jsonResponse({ error: 'Project is no longer awaiting payment' }, 409);
  }

  return jsonResponse({
    success: true,
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
    master_total_cents: masterTotal,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { quote_id, project_id: pid } = await req.json();

    // Master-quote projects pay one project-level PI (no quotes). Detect and branch
    // before the quote lookup. Legacy projects fall through to the per-quote path.
    if (pid && !quote_id) {
      let projectResult = await adminClient
        .from('projects')
        .select('id, homeowner_id, payment_model, payment_status, master_total_cents, master_payment_intent_id, ai_cost_min, ai_cost_max')
        .eq('id', pid)
        .maybeSingle();
      if (projectResult.error && isMissingColumnError(projectResult.error)) {
        // Pre-migration: master columns absent, so no master projects exist — fall through.
        projectResult = { data: null, error: null } as typeof projectResult;
      }
      if (projectResult.error) throw projectResult.error;
      const projectRow = projectResult.data as (MasterProject & { payment_model?: string }) | null;
      if (projectRow?.payment_model === 'master') {
        return await handleMasterPaymentIntent(adminClient, stripe, user, projectRow);
      }
    }

    const quoteSelect = `
      id, total_amount, status, project_id, stripe_payment_intent_id, stripe_transfer_group,
      project:projects ( id, homeowner_id )
    `;

    let quote: any = null;
    let quoteError: any = null;

    // Accept either a direct quote_id or a project_id (find the newest pending quote automatically).
    if (quote_id) {
      const result = await adminClient
        .from('quotes')
        .select(quoteSelect)
        .eq('id', quote_id)
        .single();
      quote = result.data;
      quoteError = result.error;
    } else {
      const result = await adminClient
        .from('quotes')
        .select(quoteSelect)
        .eq('project_id', pid)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
        .limit(1);
      quote = result.data?.[0] ?? null;
      quoteError = result.error;
    }

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const project = Array.isArray(quote.project)
      ? quote.project[0]
      : quote.project as { id: string; homeowner_id: string } | null;
    if (!project) {
      return new Response(JSON.stringify({ error: 'Quote project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only homeowner can pay
    if (project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (quote.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Quote is not pending approval' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quoteId = quote.id;

    if (!Number.isFinite(quote.total_amount) || quote.total_amount <= 0) {
      return new Response(JSON.stringify({ error: 'Quote total must be greater than zero' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create Stripe customer for homeowner
    const customerId = await getOrCreateStripeCustomer(adminClient, stripe, user);

    if (quote.stripe_payment_intent_id) {
      const existingPaymentIntent = await stripe.paymentIntents.retrieve(quote.stripe_payment_intent_id);

      if (existingPaymentIntent.status === 'succeeded') {
        return new Response(JSON.stringify({ error: 'Payment has already succeeded for this quote' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (
        !['canceled', 'requires_capture'].includes(existingPaymentIntent.status)
        && existingPaymentIntent.amount === quote.total_amount
        && existingPaymentIntent.currency === 'cad'
        && existingPaymentIntent.client_secret
      ) {
        return new Response(
          JSON.stringify({
            success: true,
            client_secret: existingPaymentIntent.client_secret,
            payment_intent_id: existingPaymentIntent.id,
            reused: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create PaymentIntent — funds captured to WalkerAI platform immediately
    // (We use immediate capture + Transfers for milestone releases to avoid 7-day auth expiry)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: quote.total_amount,
      currency: 'cad',
      customer: customerId,
      transfer_group: `project_${project.id}`,
      metadata: {
        project_id: project.id,
        quote_id: quoteId,
        homeowner_id: user.id,
      },
      description: `WalkerAI — Renovation Project ${project.id}`,
    });

    // Store payment intent ID on quote so the stripe-webhook can look it up later.
    // Do NOT set status='approved' or project status='active' here — that happens
    // in stripe-webhook on payment_intent.succeeded, which is the authoritative event.
    const { data: updatedQuote, error: quoteUpdateError } = await adminClient
      .from('quotes')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        stripe_transfer_group: `project_${project.id}`,
      })
      .eq('id', quoteId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (quoteUpdateError) throw quoteUpdateError;
    if (!updatedQuote) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      return new Response(JSON.stringify({ error: 'Quote is no longer pending payment' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('create-payment-intent error:', err);
    if (err instanceof Stripe.errors.StripeError) {
      return new Response(JSON.stringify({ error: `Stripe error: ${err.message}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
