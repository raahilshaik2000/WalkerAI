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
  stripe_account_id?: string | null;
  business_name?: string | null;
  city?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  license_number?: string | null;
  license_doc_url?: string | null;
  insurance_doc_url?: string | null;
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
  gcId: string,
  readiness: ReturnType<typeof stripeReadiness> & { stripe_account_id: string },
) {
  const result = await adminClient
    .from('general_contractors')
    .update(readiness)
    .eq('id', gcId);

  if (!isMissingColumnError(result.error)) {
    if (result.error) throw result.error;
    return;
  }

  const fallback = await adminClient
    .from('general_contractors')
    .update({ stripe_account_id: readiness.stripe_account_id })
    .eq('id', gcId);
  if (fallback.error) throw fallback.error;
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

function getGeneralContractor(row: { general_contractor?: unknown }) {
  const gc = Array.isArray(row.general_contractor)
    ? row.general_contractor[0]
    : row.general_contractor;
  return gc as ConciergeGeneralContractor | null | undefined;
}

async function assertStripePayoutReady(
  stripe: Stripe,
  adminClient: ReturnType<typeof createClient>,
  gcId: string,
  stripeAccountId: string | null,
) {
  if (!stripeAccountId) {
    throw new Error('General contractor has not connected Stripe payouts');
  }

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const readiness = { stripe_account_id: account.id, ...stripeReadiness(account) };
  await updateStripeReadiness(adminClient, gcId, readiness);

  if (!readiness.stripe_details_submitted || !readiness.stripe_payouts_enabled || !readiness.stripe_transfers_active) {
    throw new Error('General contractor must finish Stripe payout onboarding before concierge payment can be released');
  }
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

    const { booking_id } = await req.json();
    if (!booking_id) throw new Error('booking_id required');

    const { data: booking, error: bookingError } = await adminClient
      .from('gc_concierge_bookings')
      .select(`
        id, project_id, homeowner_id, general_contractor_id, title, status,
        payment_status, contractor_payout_cents, stripe_transfer_id,
        general_contractor:general_contractors (
          id, user_id, verified, concierge_enabled, stripe_account_id,
          business_name, city, province, lat, lng, license_number, license_doc_url, insurance_doc_url
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Concierge booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (booking.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (booking.status === 'completed' && booking.stripe_transfer_id) {
      return new Response(
        JSON.stringify({
          success: true,
          already_released: true,
          transfer_id: booking.stripe_transfer_id,
          payout_amount: booking.contractor_payout_cents,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (booking.status !== 'accepted') {
      throw new Error('Concierge booking must be accepted before payout can be released');
    }
    if (booking.payment_status !== 'paid') {
      throw new Error('Concierge booking must be paid before payout can be released');
    }
    if (booking.stripe_transfer_id) {
      throw new Error('Concierge payout was already released');
    }
    if (!booking.contractor_payout_cents || booking.contractor_payout_cents <= 0) {
      throw new Error('Calculated GC payout must be greater than zero');
    }

    const gc = getGeneralContractor(booking);
    if (!gc?.id || !gc.user_id) throw new Error('General contractor context is incomplete');
    if (!hasCompleteGcConciergeProfile(gc)) {
      throw new Error('General contractor is no longer eligible for concierge payouts');
    }

    const { data: appUser, error: appUserError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', gc.user_id)
      .maybeSingle();
    if (appUserError) throw appUserError;
    if (appUser?.role !== 'general_contractor') {
      throw new Error('General contractor is no longer eligible for concierge payouts');
    }

    await assertStripePayoutReady(stripe, adminClient, gc.id, gc.stripe_account_id ?? null);

    const transfer = await stripe.transfers.create(
      {
        amount: booking.contractor_payout_cents,
        currency: 'cad',
        destination: gc.stripe_account_id,
        transfer_group: `gc_concierge_${booking.id}`,
        metadata: {
          gc_concierge_booking_id: booking.id,
          project_id: booking.project_id,
          general_contractor_id: gc.id,
        },
        description: `WalkerAI Concierge Payout - ${booking.title}`,
      },
      { idempotencyKey: `gc-concierge-payout-${booking.id}` },
    );

    const { data: releasedBooking, error: updateError } = await adminClient
      .from('gc_concierge_bookings')
      .update({
        status: 'completed',
        stripe_transfer_id: transfer.id,
        payout_released_at: new Date().toISOString(),
      })
      .eq('id', booking_id)
      .eq('status', 'accepted')
      .eq('payment_status', 'paid')
      .is('stripe_transfer_id', null)
      .select('id')
      .maybeSingle();

    if (updateError) {
      throw new Error(`Transfer created but concierge booking update failed: ${updateError.message}`);
    }
    if (!releasedBooking) {
      throw new Error('Concierge payout was already released or is no longer payable');
    }

    if (gc.user_id) {
      const { error: notificationError } = await adminClient.from('notifications').insert({
        user_id: gc.user_id,
        type: 'gc_concierge_payout_released',
        payload: {
          project_id: booking.project_id,
          concierge_booking_id: booking.id,
          amount: booking.contractor_payout_cents,
          currency: 'CAD',
        },
      });
      if (notificationError) console.warn('gc_concierge_payout_released notification failed:', notificationError);
    }

    return new Response(
      JSON.stringify({ success: true, transfer_id: transfer.id, payout_amount: booking.contractor_payout_cents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to release concierge payout' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
