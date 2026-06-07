import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function assertStripePayoutReady(stripeAccountId: string | null): Promise<void> {
  if (!stripeAccountId) {
    throw new Error('Connect Stripe payouts before claiming material orders');
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeSecretKey) {
    throw new Error('Stripe payouts are not configured');
  }

  const stripe = new Stripe(stripeSecretKey);
  const account = await stripe.accounts.retrieve(stripeAccountId);
  const transfersActive = account.capabilities?.transfers === 'active';

  if (!account.details_submitted || !account.payouts_enabled || !transfersActive) {
    throw new Error('Finish Stripe payout onboarding before claiming material orders');
  }
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

function isMissingFunctionError(
  error: { message?: string } | null | undefined,
  functionName: string,
) {
  const message = error?.message ?? '';
  return message.includes(functionName) && (
    /function .* does not exist/i.test(message)
    || /could not find/i.test(message)
    || /not found/i.test(message)
    || /schema cache/i.test(message)
  );
}

function firstJoinedRow(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function haversineKm(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function canFulfillByLatLngFallback(
  supplier: Record<string, unknown>,
  order: Record<string, unknown>,
): boolean | null {
  const supplierLat = finiteNumber(supplier.lat);
  const supplierLng = finiteNumber(supplier.lng);
  const serviceRadiusKm = finiteNumber(supplier.service_radius_km);
  const project = firstJoinedRow(order.projects);
  const projectLat = finiteNumber(project?.lat);
  const projectLng = finiteNumber(project?.lng);

  if (
    supplierLat == null
    || supplierLng == null
    || serviceRadiusKm == null
    || serviceRadiusKm <= 0
    || projectLat == null
    || projectLng == null
  ) {
    return null;
  }

  return haversineKm(supplierLat, supplierLng, projectLat, projectLng) <= serviceRadiusKm;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

  try {
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const order_id = typeof body?.order_id === 'string' ? body.order_id.trim() : '';
    if (!order_id) {
      return new Response(JSON.stringify({ error: 'order_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is a verified supplier
    let supplierResult = await adminClient
      .from('suppliers')
      .select('id, verified, categories, stripe_account_id, lat, lng, service_radius_km')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isMissingColumnError(supplierResult.error)) {
      supplierResult = await adminClient
        .from('suppliers')
        .select('id, verified, categories, stripe_account_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    const { data: supplier, error: supplierErr } = supplierResult;

    if (supplierErr || !supplier || !supplier.verified) {
      return new Response(
        JSON.stringify({ error: 'Only verified suppliers can claim orders' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      await assertStripePayoutReady(supplier.stripe_account_id);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Finish Stripe payout onboarding before claiming material orders' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load the order to verify it is still open
    let orderResult = await adminClient
      .from('material_orders')
      .select('id, status, category, quality_tier, project_id, offered_price, final_price, materials(item), projects:project_id(lat, lng)')
      .eq('id', order_id)
      .single();
    if (isMissingColumnError(orderResult.error)) {
      orderResult = await adminClient
        .from('material_orders')
        .select('id, status, quality_tier, project_id, offered_price, final_price, materials(item)')
        .eq('id', order_id)
        .single();
    }
    const { data: order, error: orderErr } = orderResult;

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (order.status !== 'open') {
      return new Response(
        JSON.stringify({ error: 'Order is no longer available', code: 'ORDER_CLAIMED' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supplierCategories = Array.isArray(supplier.categories) ? supplier.categories : [];
    const orderCategory = 'category' in order ? order.category as string | null : null;
    if (orderCategory && !supplierCategories.includes(orderCategory)) {
      return new Response(
        JSON.stringify({ error: 'This order is outside your supplier categories', code: 'CATEGORY_MISMATCH' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: canFulfill, error: fulfillErr } = await adminClient.rpc(
      'supplier_can_fulfill_material_order',
      { p_order_id: order_id, p_supplier_id: supplier.id },
    );
    if (fulfillErr && !isMissingFunctionError(fulfillErr, 'supplier_can_fulfill_material_order')) throw fulfillErr;
    if (fulfillErr && isMissingFunctionError(fulfillErr, 'supplier_can_fulfill_material_order')) {
      const fallbackCanFulfill = canFulfillByLatLngFallback(supplier, order);
      if (fallbackCanFulfill === false) {
        return new Response(
          JSON.stringify({ error: 'This order is outside your supplier service area', code: 'SERVICE_AREA_MISMATCH' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (fallbackCanFulfill === null) {
        console.warn('supplier_can_fulfill_material_order missing and lat/lng fallback unavailable');
      }
    }
    if (!fulfillErr && !canFulfill) {
      return new Response(
        JSON.stringify({ error: 'This order is outside your supplier service area', code: 'SERVICE_AREA_MISMATCH' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fixedPrice = order.final_price ?? order.offered_price ?? null;
    if (!fixedPrice || fixedPrice <= 0) {
      return new Response(
        JSON.stringify({ error: 'Order is missing a valid fixed price', code: 'INVALID_FIXED_PRICE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atomic claim using FOR UPDATE to prevent race conditions
    const { data: claimResult, error: claimErr } = await adminClient.rpc(
      'atomic_claim_material_order',
      { p_order_id: order_id, p_supplier_id: supplier.id }
    );

    let claimedWithFallback = false;
    if (claimErr) {
      if (isMissingFunctionError(claimErr, 'atomic_claim_material_order')) {
        const { data: claimedOrder, error: claimUpdateError } = await adminClient
          .from('material_orders')
          .update({ status: 'accepted', accepted_supplier_id: supplier.id })
          .eq('id', order_id)
          .eq('status', 'open')
          .is('accepted_supplier_id', null)
          .select('id')
          .maybeSingle();

        if (claimUpdateError) throw claimUpdateError;
        claimedWithFallback = !!claimedOrder;
      } else {
        const isLock = claimErr.message?.includes('lock');
        return new Response(
          JSON.stringify({
            error: isLock ? 'Order is being claimed — please try again.' : claimErr.message,
            code: 'RACE_CONDITION',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!claimResult && !claimedWithFallback) {
      return new Response(
        JSON.stringify({ error: 'Order is no longer available', code: 'ORDER_CLAIMED' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: finalPriceError } = await adminClient
      .from('material_orders')
      .update({ final_price: fixedPrice })
      .eq('id', order_id)
      .is('final_price', null);
    if (finalPriceError) throw finalPriceError;

    // Notify homeowner + every assigned contractor that material is being fulfilled.
    const { data: project } = await adminClient
      .from('projects')
      .select('homeowner_id, assigned_company_id, companies(user_id)')
      .eq('id', order.project_id)
      .single();

    if (project) {
      const notifications = [];

      notifications.push({
        user_id: project.homeowner_id,
        type: 'material_order_claimed',
        payload: {
          order_id,
          project_id: order.project_id,
          message: 'A supplier has claimed your material order and will begin processing.',
          deep_link: `/(homeowner)/project/${order.project_id}`,
        },
      });

      const companyUserIds = new Set<string>();
      const companyData = project.companies as { user_id: string } | null;
      if (companyData?.user_id) {
        companyUserIds.add(companyData.user_id);
      }

      const { data: slots } = await adminClient
        .from('project_slots')
        .select('companies(user_id)')
        .eq('project_id', order.project_id)
        .not('assigned_company_id', 'is', null);

      for (const slot of slots ?? []) {
        const slotCompany = Array.isArray((slot as any).companies)
          ? (slot as any).companies[0]
          : (slot as any).companies;
        if (slotCompany?.user_id) companyUserIds.add(slotCompany.user_id);
      }

      for (const userId of companyUserIds) {
        notifications.push({
          user_id: userId,
          type: 'material_order_claimed',
          payload: {
            order_id,
            project_id: order.project_id,
            message: 'A material order for your project has been claimed by a supplier.',
            deep_link: `/(company)/job/${order.project_id}`,
          },
        });
      }

      const { error: notificationError } = await adminClient.from('notifications').insert(notifications);
      if (notificationError) {
        console.warn('claim-material-order notification error:', notificationError.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, order_id, supplier_id: supplier.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('claim-material-order error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
