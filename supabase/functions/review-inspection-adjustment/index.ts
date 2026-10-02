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

    // Verify caller has Head Office / Admin role
    const { data: callerUser, error: userErr } = await adminClient
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (userErr || !callerUser || callerUser.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Head Office admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { adjustment_id, action, head_office_notes = '' } = body;

    if (!adjustment_id || !['approve', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid adjustment_id or action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load adjustment
    const { data: adjustment, error: adjErr } = await adminClient
      .from('site_inspection_adjustments')
      .select('*')
      .eq('id', adjustment_id)
      .maybeSingle();

    if (adjErr || !adjustment) {
      return new Response(JSON.stringify({ error: 'Adjustment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reject') {
      const { error: updateErr } = await adminClient
        .from('site_inspection_adjustments')
        .update({
          status: 'rejected_by_head_office',
          head_office_reviewer_id: user.id,
          head_office_reviewed_at: new Date().toISOString(),
          head_office_notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', adjustment_id);

      if (updateErr) throw updateErr;

      await adminClient.from('admin_activity_log').insert({
        admin_id: user.id,
        action: 'site_inspection_adjustment_rejected',
        entity_type: 'site_inspection_adjustment',
        entity_id: adjustment_id,
        details: { head_office_notes },
        reason: `Head Office rejected site inspection adjustment ${adjustment_id}: ${head_office_notes}`,
      });

      return new Response(JSON.stringify({ success: true, status: 'rejected_by_head_office' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action is 'approve'
    const isPriceIncrease = adjustment.cost_delta > 0;
    const nextStatus = isPriceIncrease ? 'awaiting_homeowner_funding' : 'credited';

    const { error: approveErr } = await adminClient
      .from('site_inspection_adjustments')
      .update({
        status: nextStatus,
        head_office_reviewer_id: user.id,
        head_office_reviewed_at: new Date().toISOString(),
        head_office_notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adjustment_id);

    if (approveErr) throw approveErr;

    // Load project details for learning record and sync
    const { data: project } = await adminClient
      .from('projects')
      .select('*')
      .eq('id', adjustment.project_id)
      .maybeSingle();

    // If price decrease/credit, synchronize project budget and write learning record immediately
    if (!isPriceIncrease && project) {
      const currentCost = project.estimated_cost_cents || 0;
      const updatedCost = Math.max(0, currentCost + adjustment.cost_delta);

      await adminClient
        .from('projects')
        .update({
          estimated_cost_cents: updatedCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id);

      // Create mirrored change order record for unified ledger
      await adminClient.from('change_orders').insert({
        project_id: project.id,
        company_id: adjustment.company_id,
        description: `[Site Inspection Credit] ${adjustment.description}`,
        cost_delta: adjustment.cost_delta,
        status: 'approved',
        signed_by_company: true,
        signed_by_homeowner: true,
      });

      // Write to verified estimation learning dataset
      const originalMeas = project.measurements || {};
      const verifiedMeas = adjustment.corrected_measurements || {};
      const origSqft = Number(originalMeas.lengthFt || 0) * Number(originalMeas.widthFt || 0);
      const verifiedSqft = Number(verifiedMeas.lengthFt || 0) * Number(verifiedMeas.widthFt || 0);
      const varianceRatio = origSqft > 0 && verifiedSqft > 0
        ? Number((verifiedSqft / origSqft).toFixed(4))
        : 1.0;

      await adminClient.from('estimation_learning_records').insert({
        project_id: project.id,
        adjustment_id: adjustment.id,
        room_type: project.room_type || 'kitchen',
        province: project.province || 'ON',
        quality_tier: 'mid-range',
        original_measurements: originalMeas,
        verified_measurements: verifiedMeas,
        dimensional_variance_ratio: varianceRatio,
        original_estimated_cost_cents: currentCost,
        approved_cost_delta_cents: adjustment.cost_delta,
        final_cost_cents: updatedCost,
        adjustment_category: adjustment.reason_category,
        adjustment_reason: adjustment.description,
        evidence_urls: adjustment.evidence_urls,
        itemized_labor_diff: adjustment.labor_breakdown,
        itemized_material_diff: adjustment.material_breakdown,
        head_office_approved_by: user.id,
        calibration_factors: {
          area_ratio: varianceRatio,
          cost_per_sqft_delta_cad: verifiedSqft > 0 ? (adjustment.cost_delta / 100) / verifiedSqft : 0,
        },
      });
    }

    await adminClient.from('admin_activity_log').insert({
      admin_id: user.id,
      action: 'site_inspection_adjustment_approved',
      entity_type: 'site_inspection_adjustment',
      entity_id: adjustment_id,
      details: {
        cost_delta: adjustment.cost_delta,
        next_status: nextStatus,
        head_office_notes,
      },
      reason: `Head Office approved site inspection adjustment ${adjustment_id} (next: ${nextStatus})`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        status: nextStatus,
        requires_funding: isPriceIncrease,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
