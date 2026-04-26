import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { order_id } = await req.json();
    if (!order_id) throw new Error('order_id required');

    // Fetch the order
    const { data: order, error: ordErr } = await supabase
      .from('material_orders')
      .select('*, supplier:suppliers(stripe_account_id, user_id)')
      .eq('id', order_id)
      .single();
    if (ordErr || !order) throw new Error('Order not found');
    if (order.status !== 'confirmed') throw new Error('Order must be confirmed before payout');
    if (!order.final_price || order.final_price <= 0) throw new Error('Invalid final price');

    const supplierStripeId = (order.supplier as any)?.stripe_account_id;
    if (!supplierStripeId) throw new Error('Supplier has no Stripe account connected');

    // Calculate platform fee
    const platformFeePct = order.platform_fee_pct ?? 8;
    const platformFee = Math.round(order.final_price * (platformFeePct / 100));
    const payoutAmount = order.final_price - platformFee;

    // Create Stripe transfer to supplier's Connect account
    const transfer = await stripe.transfers.create({
      amount: payoutAmount,
      currency: 'cad',
      destination: supplierStripeId,
      metadata: { order_id, project_id: order.project_id },
    });

    // Update order status to paid
    await supabase
      .from('material_orders')
      .update({ status: 'paid', stripe_transfer_id: transfer.id })
      .eq('id', order_id);

    // Notify supplier
    const supplierId = (order.supplier as any)?.user_id;
    if (supplierId) {
      await supabase.from('notifications').insert({
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
