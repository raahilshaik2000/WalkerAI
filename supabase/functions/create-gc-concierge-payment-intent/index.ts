import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ConciergeGeneralContractor = {
  id?: string;
  user_id?: string | null;
  verified?: boolean | null;
  concierge_enabled?: boolean | null;
  business_name?: string | null;
  city?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  license_number?: string | null;
  license_doc_url?: string | null;
  insurance_doc_url?: string | null;
};

function getGeneralContractor(row: { general_contractor?: unknown }) {
  const gc = Array.isArray(row.general_contractor)
    ? row.general_contractor[0]
    : row.general_contractor;
  return gc as ConciergeGeneralContractor | null | undefined;
}

function hasCompleteGcConciergeProfile(gc: ConciergeGeneralContractor | null | undefined) {
  return gc?.verified === true
    && gc?.concierge_enabled === true
    && !!gc?.business_name?.trim()
    && !!gc?.city?.trim()
    && !!gc?.province?.trim()
    && typeof gc?.lat === 'number'
    && typeof gc?.lng === 'number'
    && !!gc?.license_number?.trim()
    && !!gc?.license_doc_url?.trim()
    && !!gc?.insurance_doc_url?.trim();
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
    { global: { headers: { Authorization: authHeader } } },
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

    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: booking, error: bookingError } = await adminClient
      .from('gc_concierge_bookings')
      .select(`
        id, project_id, homeowner_id, general_contractor_id, title, price_cents,
        status, payment_status, stripe_payment_intent_id,
        general_contractor:general_contractors (
          id, user_id, verified, concierge_enabled, business_name, city, province, lat, lng,
          license_number, license_doc_url, insurance_doc_url
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Concierge booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (booking.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (booking.status !== 'accepted') {
      return new Response(JSON.stringify({ error: 'Concierge booking must be accepted before payment' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gc = getGeneralContractor(booking);
    if (!gc?.id || !gc.user_id || !hasCompleteGcConciergeProfile(gc)) {
      return new Response(JSON.stringify({ error: 'Concierge booking is no longer available for payment' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: appUser, error: appUserError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', gc.user_id)
      .maybeSingle();
    if (appUserError) throw appUserError;
    if (appUser?.role !== 'general_contractor') {
      return new Response(JSON.stringify({ error: 'Concierge booking is no longer available for payment' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (booking.payment_status === 'paid') {
      return new Response(JSON.stringify({ error: 'Concierge booking is already paid' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!Number.isFinite(booking.price_cents) || booking.price_cents <= 0) {
      return new Response(JSON.stringify({ error: 'Concierge booking price must be greater than zero' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    if (booking.stripe_payment_intent_id) {
      const existingPaymentIntent = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);

      if (existingPaymentIntent.status === 'succeeded') {
        return new Response(JSON.stringify({ error: 'Payment has already succeeded for this booking' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (
        !['canceled', 'requires_capture'].includes(existingPaymentIntent.status)
        && existingPaymentIntent.amount === booking.price_cents
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
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: booking.price_cents,
      currency: 'cad',
      customer: customerId,
      transfer_group: `gc_concierge_${booking.id}`,
      metadata: {
        project_id: booking.project_id,
        gc_concierge_booking_id: booking.id,
        general_contractor_id: booking.general_contractor_id,
        homeowner_id: user.id,
      },
      description: `WalkerAI - ${booking.title}`,
    });

    const { data: updatedBooking, error: updateError } = await adminClient
      .from('gc_concierge_bookings')
      .update({
        payment_status: 'payment_pending',
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq('id', booking.id)
      .eq('status', 'accepted')
      .neq('payment_status', 'paid')
      .select('id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedBooking) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      return new Response(JSON.stringify({ error: 'Concierge booking is no longer payable' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('create-gc-concierge-payment-intent error:', err);
    if (err instanceof Stripe.errors.StripeError) {
      return new Response(JSON.stringify({ error: `Stripe error: ${err.message}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
