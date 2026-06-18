import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

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
  supplierId: string,
  readiness: ReturnType<typeof stripeReadiness> & { stripe_account_id: string },
) {
  const result = await adminClient
    .from('suppliers')
    .update(readiness)
    .eq('id', supplierId);

  if (!isMissingColumnError(result.error)) {
    if (result.error) throw result.error;
    return;
  }

  const fallback = await adminClient
    .from('suppliers')
    .update({ stripe_account_id: readiness.stripe_account_id })
    .eq('id', supplierId);
  if (fallback.error) throw fallback.error;
}

async function assertStripePayoutReady(
  stripe: Stripe,
  adminClient: ReturnType<typeof createClient>,
  supplierId: string,
  stripeAccountId: string | null,
): Promise<void> {
  if (!stripeAccountId) {
    throw new Error('Supplier has no Stripe account connected');
  }

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const readiness = { stripe_account_id: account.id, ...stripeReadiness(account) };
  await updateStripeReadiness(adminClient, supplierId, readiness);

  if (!readiness.stripe_details_submitted || !readiness.stripe_payouts_enabled || !readiness.stripe_transfers_active) {
    throw new Error('Supplier must finish Stripe payout onboarding before payment can be released');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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

    const { order_id } = await req.json();
    if (!order_id) throw new Error('order_id required');

    // Fetch the order
    const { data: order, error: ordErr } = await adminClient
      .from('material_orders')
      .select('*, accepted_supplier:suppliers!accepted_supplier_id(id, stripe_account_id, user_id), project:projects(homeowner_id)')
      .eq('id', order_id)
      .single();
    if (ordErr || !order) throw new Error('Order not found');
    const project = Array.isArray(order.project)
      ? order.project[0]
      : order.project as { homeowner_id?: string } | null;
    if (project?.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (order.status === 'paid' || order.stripe_transfer_id) throw new Error('Order has already been paid');
    if (!['delivered', 'confirmed'].includes(order.status)) throw new Error('Order must be delivered before payout');
    if (!order.delivery_photo_url) throw new Error('Delivery photo is required before payout');
    if (!order.final_price || order.final_price <= 0) throw new Error('Invalid final price');

    const acceptedSupplier = Array.isArray(order.accepted_supplier)
      ? order.accepted_supplier[0]
      : order.accepted_supplier as { id?: string; stripe_account_id?: string; user_id?: string } | null;
    if (!acceptedSupplier?.id) throw new Error('Supplier context is incomplete');
    const supplierStripeId = acceptedSupplier?.stripe_account_id;
    await assertStripePayoutReady(stripe, adminClient, acceptedSupplier.id, supplierStripeId ?? null);

    // Calculate platform fee
    const platformFeePct = order.platform_fee_pct ?? 8;
    const platformFee = Math.round(order.final_price * (platformFeePct / 100));
    const payoutAmount = order.final_price - platformFee;

    // Create Stripe transfer to supplier's Connect account
    const transfer = await stripe.transfers.create(
      {
        amount: payoutAmount,
        currency: 'cad',
        destination: supplierStripeId,
        metadata: { order_id, project_id: order.project_id },
      },
      { idempotencyKey: `supplier-order-payout-${order_id}` },
    );

    // Update order status to paid
    const { data: paidOrder, error: updateError } = await adminClient
      .from('material_orders')
      .update({
        status: 'paid',
        confirmed_at: order.confirmed_at ?? new Date().toISOString(),
        stripe_transfer_id: transfer.id,
      })
      .eq('id', order_id)
      .is('stripe_transfer_id', null)
      .in('status', ['delivered', 'confirmed'])
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!paidOrder) throw new Error('Order payout was already processed or is no longer payable');

    // Notify supplier
    const supplierId = acceptedSupplier?.user_id;
    if (supplierId) {
      await adminClient.from('notifications').insert({
        user_id: supplierId,
        type: 'supplier_paid',
        payload: { order_id, amount: payoutAmount, currency: 'CAD' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, transfer_id: transfer.id, payout_amount: payoutAmount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
