import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const {
      project_id,
      company_id,
      trade_type,
      reason_category,
      description,
      evidence_urls = [],
      corrected_measurements = {},
      labor_breakdown = [],
      material_breakdown = [],
      schedule_impact_days = 0,
      cost_delta,
    } = body;

    if (!project_id || !company_id || !trade_type || !reason_category || !description) {
      return new Response(JSON.stringify({ error: 'Missing required adjustment fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (typeof cost_delta !== 'number' || !Number.isFinite(cost_delta)) {
      return new Response(JSON.stringify({ error: 'Invalid cost_delta amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify company belongs to caller
    const { data: company, error: companyErr } = await adminClient
      .from('companies')
      .select('id, user_id, name')
      .eq('id', company_id)
      .maybeSingle();

    if (companyErr || !company || company.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: caller does not own this company' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify project exists
    const { data: project, error: projErr } = await adminClient
      .from('projects')
      .select('id, homeowner_id, title, status')
      .eq('id', project_id)
      .maybeSingle();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert site inspection adjustment
    const { data: adjustment, error: insertErr } = await adminClient
      .from('site_inspection_adjustments')
      .insert({
        project_id,
        company_id,
        trade_type,
        reason_category,
        description,
        evidence_urls,
        corrected_measurements,
        labor_breakdown,
        material_breakdown,
        schedule_impact_days,
        cost_delta,
        status: 'submitted',
      })
      .select()
      .single();

    if (insertErr) {
      throw insertErr;
    }

    // Log in admin audit trail
    await adminClient.from('admin_activity_log').insert({
      admin_id: user.id,
      action: 'site_inspection_adjustment_submitted',
      entity_type: 'site_inspection_adjustment',
      entity_id: adjustment.id,
      details: {
        project_id,
        company_id,
        trade_type,
        cost_delta,
        reason_category,
      },
      reason: `Trade ${company.name} submitted site inspection price adjustment: ${description.slice(0, 100)}`,
    });

    return new Response(JSON.stringify({ success: true, adjustment }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
