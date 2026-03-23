import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { quote_id } = await req.json();

    // Load quote with project
    const { data: quote, error: quoteError } = await adminClient
      .from('quotes')
      .select(`
        id, total_amount, status, project_id,
        project:projects ( id, homeowner_id )
      `)
      .eq('id', quote_id)
      .single();

    if (quoteError || !quote) {
      return new Response(JSON.stringify({ error: 'Quote not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const project = quote.project as { id: string; homeowner_id: string };

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

    // Get or create Stripe customer for homeowner
    const { data: userData } = await adminClient
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = userData?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData?.email ?? user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await adminClient
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
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
        quote_id,
        homeowner_id: user.id,
      },
      description: `WalkerAI — Renovation Project ${project.id}`,
    });

    // Approve quote and link payment intent
    await adminClient
      .from('quotes')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntent.id,
        stripe_transfer_group: `project_${project.id}`,
      })
      .eq('id', quote_id);

    // Update project status to active
    await adminClient
      .from('projects')
      .update({ status: 'active' })
      .eq('id', project.id);

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
