import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { order_id }: { order_id: string } = await req.json();

    // Verify caller is a verified supplier
    const { data: supplier, error: supplierErr } = await adminClient
      .from('suppliers')
      .select('id, verified, categories')
      .eq('user_id', user.id)
      .single();

    if (supplierErr || !supplier || !supplier.verified) {
      return new Response(
        JSON.stringify({ error: 'Only verified suppliers can claim orders' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load the order to verify it is still open
    const { data: order, error: orderErr } = await adminClient
      .from('material_orders')
      .select('id, status, quality_tier, project_id, materials(item)')
      .eq('id', order_id)
      .single();

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

    // Atomic claim using FOR UPDATE to prevent race conditions
    const { data: claimResult, error: claimErr } = await adminClient.rpc(
      'atomic_claim_material_order',
      { p_order_id: order_id, p_supplier_id: supplier.id }
    );

    if (claimErr) {
      const isLock = claimErr.message?.includes('lock');
      return new Response(
        JSON.stringify({
          error: isLock ? 'Order is being claimed — please try again.' : claimErr.message,
          code: 'RACE_CONDITION',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!claimResult) {
      return new Response(
        JSON.stringify({ error: 'Order is no longer available', code: 'ORDER_CLAIMED' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Notify homeowner + contractor that material is being fulfilled
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

      const companyData = project.companies as { user_id: string } | null;
      if (companyData?.user_id) {
        notifications.push({
          user_id: companyData.user_id,
          type: 'material_order_claimed',
          payload: {
            order_id,
            project_id: order.project_id,
            message: 'A material order for your project has been claimed by a supplier.',
            deep_link: `/(company)/job/${order.project_id}`,
          },
        });
      }

      await adminClient.from('notifications').insert(notifications);
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
