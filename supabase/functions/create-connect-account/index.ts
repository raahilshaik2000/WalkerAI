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
  table: 'companies' | 'suppliers',
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

    let requestedRole = 'company';
    try {
      const body = await req.json();
      if (body?.role === 'supplier') requestedRole = 'supplier';
    } catch {
      // Existing company callers send no body.
    }

    const table = requestedRole === 'supplier' ? 'suppliers' : 'companies';
    const idField = requestedRole === 'supplier' ? 'supplier_id' : 'company_id';

    const { data: accountOwner, error: ownerError } = await adminClient
      .from(table)
      .select('id, stripe_account_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ownerError) throw ownerError;

    if (!accountOwner) {
      return new Response(JSON.stringify({ error: `${requestedRole === 'supplier' ? 'Supplier' : 'Company'} not found` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let accountId = accountOwner.stripe_account_id as string | null;
    let account: Stripe.Account;

    // Create a Stripe Express account if none exists yet
    if (!accountId) {
      account = await stripe.accounts.create({
        type: 'express',
        country: 'CA',
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          [idField]: accountOwner.id,
          role: requestedRole,
          supabase_user_id: user.id,
        },
      });
      accountId = account.id;
    } else {
      account = await stripe.accounts.retrieve(accountId);
    }

    const readiness = stripeReadiness(account);
    await updateStripeReadiness(adminClient, table, accountOwner.id, readiness);

    // Create a fresh account link every time (links expire after a few minutes)
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: 'https://walkerai.app/stripe-refresh',
      return_url: 'https://walkerai.app/stripe-return',
      type: 'account_onboarding',
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: accountLink.url,
        payout_ready: readiness.stripe_details_submitted
          && readiness.stripe_payouts_enabled
          && readiness.stripe_transfers_active,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('create-connect-account error:', err);
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
