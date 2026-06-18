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
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();
    if (userError) throw userError;

    let customerId = userData?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData?.email ?? user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error: customerUpdateError } = await adminClient
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
      if (customerUpdateError) throw customerUpdateError;
    }

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
