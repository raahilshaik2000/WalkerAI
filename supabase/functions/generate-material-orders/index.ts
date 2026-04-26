import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateOrdersBody {
  project_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { project_id }: GenerateOrdersBody = await req.json();
    if (!project_id) throw new Error('project_id required');

    // Fetch project for address + delivery deadline info
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, address, city, province, status')
      .eq('id', project_id)
      .single();
    if (projErr || !project) throw new Error('Project not found');
    if (project.status !== 'active') throw new Error('Project must be active to generate material orders');

    // Fetch all materials for the project that don't yet have an order
    const { data: materials, error: matErr } = await supabase
      .from('materials')
      .select('*')
      .eq('project_id', project_id)
      .is('material_order_id', null);
    if (matErr) throw matErr;
    if (!materials || materials.length === 0) {
      return new Response(JSON.stringify({ message: 'No materials to order', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Set delivery deadline = 7 days from now (adjust per project timeline)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);
    const deliveryDeadline = deadline.toISOString().split('T')[0];

    const deliveryAddress = [project.address, project.city, project.province].filter(Boolean).join(', ');

    // Create one material_order per material
    const orderInserts = materials.map((m: any) => ({
      project_id,
      material_id: m.id,
      status: 'open',
      quantity_needed: m.quantity ?? 1,
      unit: m.unit ?? 'units',
      quality_tier: m.quality_tier ?? null,
      delivery_address: deliveryAddress || null,
      delivery_deadline: deliveryDeadline,
    }));

    const { data: createdOrders, error: insertErr } = await supabase
      .from('material_orders')
      .insert(orderInserts)
      .select('id, material_id');
    if (insertErr) throw insertErr;

    // Link each material to its order
    for (const order of (createdOrders ?? [])) {
      await supabase
        .from('materials')
        .update({ material_order_id: order.id, order_status: 'open' })
        .eq('id', order.material_id);
    }

    // Notify all verified suppliers near the project
    const { data: suppliers } = await supabase.rpc('suppliers_within_radius', { proj_id: project_id });
    if (suppliers && suppliers.length > 0) {
      const notifInserts = suppliers.map((s: any) => ({
        user_id: s.user_id,
        type: 'new_material_order',
        payload: { project_id, order_count: createdOrders?.length ?? 0, city: project.city },
      }));
      await supabase.from('notifications').insert(notifInserts);
    }

    return new Response(
      JSON.stringify({ success: true, orders_created: createdOrders?.length ?? 0, suppliers_notified: suppliers?.length ?? 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
