import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AccountRole = 'company' | 'supplier' | 'general_contractor';

const roleLabels: Record<AccountRole, string> = {
  company: 'Company',
  supplier: 'Supplier',
  general_contractor: 'General contractor',
};

function publicFunctionUrl(slug: string, query = '') {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '');
  return `${supabaseUrl}/functions/v1/${slug}${query}`;
}

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
  const message = error?.message ?? '';
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCompleteGcPayoutProfile(accountOwner: Record<string, unknown>) {
  return hasText(accountOwner.business_name)
    && hasText(accountOwner.city)
    && hasText(accountOwner.province)
    && typeof accountOwner.lat === 'number'
    && typeof accountOwner.lng === 'number'
    && hasText(accountOwner.license_number)
    && hasText(accountOwner.license_doc_url)
    && hasText(accountOwner.insurance_doc_url);
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

    let requestedRole: AccountRole = 'company';
    try {
      const body = await req.json();
      if (body?.role === 'supplier') requestedRole = 'supplier';
      if (body?.role === 'general_contractor') requestedRole = 'general_contractor';
    } catch {
      // Existing company callers send no body.
    }

    const { data: appUser, error: appUserError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (appUserError) throw appUserError;
    if (!appUser || appUser.role !== requestedRole) {
      return new Response(JSON.stringify({ error: 'Account role does not match payout setup request' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const table = requestedRole === 'supplier'
      ? 'suppliers'
      : requestedRole === 'general_contractor'
        ? 'general_contractors'
        : 'companies';
    const idField = requestedRole === 'supplier'
      ? 'supplier_id'
      : requestedRole === 'general_contractor'
        ? 'general_contractor_id'
        : 'company_id';
    const ownerSelect = requestedRole === 'general_contractor'
      ? `
        id, stripe_account_id,
        business_name, city, province, lat, lng,
        license_number, license_doc_url, insurance_doc_url
      `
      : 'id, stripe_account_id';

    const { data: accountOwner, error: ownerError } = await adminClient
      .from(table)
      .select(ownerSelect)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ownerError) throw ownerError;

    if (!accountOwner) {
      const label = roleLabels[requestedRole];
      return new Response(JSON.stringify({ error: `${label} not found` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requestedRole === 'general_contractor' && !hasCompleteGcPayoutProfile(accountOwner)) {
      return new Response(JSON.stringify({ error: 'Complete your GC business, location, license, and insurance setup before connecting payouts' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
          // transfers-only "recipient" accounts need separate Stripe approval;
          // requesting card_payments alongside transfers avoids the
          // "platform needs approval for accounts to have requested transfers
          // without card_payments" error that blocked all payout onboarding.
          card_payments: { requested: true },
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
      refresh_url: publicFunctionUrl('stripe-return', '?refresh=1'),
      return_url: publicFunctionUrl('stripe-return'),
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
