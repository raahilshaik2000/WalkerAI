import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function stripeReadiness(account: Stripe.Account) {
  return {
    stripe_account_id: account.id,
    stripe_details_submitted: account.details_submitted,
    stripe_payouts_enabled: account.payouts_enabled,
    stripe_transfers_active: account.capabilities?.transfers === 'active',
    stripe_onboarding_checked_at: new Date().toISOString(),
  };
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

async function updateStripeReadiness(
  adminClient: ReturnType<typeof createClient>,
  table: 'companies' | 'suppliers' | 'general_contractors',
  ownerId: string,
  readiness: ReturnType<typeof stripeReadiness>,
) {
  const result = await adminClient
    .from(table)
    .update(readiness)
    .eq('id', ownerId);

  if (!isMissingColumnError(result.error)) {
    if (result.error) throw result.error;
    return;
  }

  const fallback = await adminClient
    .from(table)
    .update({ stripe_account_id: readiness.stripe_account_id })
    .eq('id', ownerId);
  if (fallback.error) throw fallback.error;
}

// Pulls the latest account state from Stripe and writes the readiness flags back
// to the owner row. Unlike create-connect-account, it does NOT mint an account
// link — it's the cheap path the app calls when it regains focus after the user
// returns from Stripe onboarding, so the displayed status reflects reality.
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

    let requestedRole: 'company' | 'supplier' | 'general_contractor' = 'company';
    try {
      const body = await req.json();
      if (body?.role === 'supplier') requestedRole = 'supplier';
      if (body?.role === 'general_contractor') requestedRole = 'general_contractor';
    } catch {
      // Company callers send no body.
    }

    const table = requestedRole === 'supplier'
      ? 'suppliers'
      : requestedRole === 'general_contractor'
        ? 'general_contractors'
        : 'companies';
    const roleLabel = requestedRole === 'supplier'
      ? 'Supplier'
      : requestedRole === 'general_contractor'
        ? 'General contractor'
        : 'Company';

    const { data: accountOwner, error: ownerError } = await adminClient
      .from(table)
      .select('id, stripe_account_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ownerError) throw ownerError;

    if (!accountOwner) {
      return new Response(JSON.stringify({ error: `${roleLabel} not found` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accountId = accountOwner.stripe_account_id as string | null;
    if (!accountId) {
      // Nothing to sync yet — onboarding has never been started.
      return new Response(
        JSON.stringify({ success: true, has_account: false, payout_ready: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const account = await stripe.accounts.retrieve(accountId);
    const readiness = stripeReadiness(account);
    await updateStripeReadiness(adminClient, table, accountOwner.id, readiness);

    const payoutReady = readiness.stripe_details_submitted
      && readiness.stripe_payouts_enabled
      && readiness.stripe_transfers_active;

    return new Response(
      JSON.stringify({
        success: true,
        has_account: true,
        payout_ready: payoutReady,
        details_submitted: readiness.stripe_details_submitted,
        payouts_enabled: readiness.stripe_payouts_enabled,
        transfers_active: readiness.stripe_transfers_active,
        // Surface what (if anything) Stripe is still waiting on, so the app
        // and we can tell "not finished" apart from "finished but blocked".
        requirements_currently_due: account.requirements?.currently_due ?? [],
        requirements_past_due: account.requirements?.past_due ?? [],
        disabled_reason: account.requirements?.disabled_reason ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('refresh-connect-status error:', err);
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
