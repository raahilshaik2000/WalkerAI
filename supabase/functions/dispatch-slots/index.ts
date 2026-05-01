import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DispatchSlotsBody {
  project_id: string;
  round?: number;
}

interface NearbyCompany {
  company_id: string;
  distance_km: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { project_id, round = 1 }: DispatchSlotsBody = await req.json();
    const radiusKm = getRadiusForRound(round);

    // Load project location + homeowner
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, lat, lng, homeowner_id, room_type, city, province, ai_cost_min, ai_cost_max')
      .eq('id', project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load all open slots for this project
    const { data: openSlots } = await supabase
      .from('project_slots')
      .select('id, trade_type, description, estimated_cost_min, estimated_cost_max')
      .eq('project_id', project_id)
      .eq('status', 'open');

    if (!openSlots || openSlots.length === 0) {
      return new Response(
        JSON.stringify({ dispatched: 0, message: 'No open slots' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find nearby companies for each slot's trade type
    const results: { slot_id: string; trade_type: string; dispatched: number }[] = [];

    for (const slot of openSlots) {
      // Find companies with matching trade type within radius
      const { data: nearby } = await supabase.rpc('companies_within_radius', {
        project_lat: project.lat,
        project_lng: project.lng,
        radius_km: radiusKm,
      }) as { data: NearbyCompany[] | null };

      if (!nearby || nearby.length === 0) continue;

      // Filter to companies that have this trade type
      const { data: matchedCompanies } = await supabase
        .from('companies')
        .select('id, user_id, trade_types')
        .in('id', nearby.map((n) => n.company_id))
        .filter('trade_types', 'cs', `{${slot.trade_type}}`);

      if (!matchedCompanies || matchedCompanies.length === 0) continue;

      // Exclude companies already dispatched for this slot
      const { data: alreadyDispatched } = await supabase
        .from('dispatch_logs')
        .select('company_id')
        .eq('slot_id', slot.id);

      const dispatchedIds = new Set((alreadyDispatched ?? []).map((d: { company_id: string }) => d.company_id));
      const eligible = matchedCompanies.filter((c) => !dispatchedIds.has(c.id));

      if (eligible.length === 0) continue;

      // Insert dispatch logs for this slot
      const logs = eligible.map((c) => ({
        project_id,
        company_id: c.id,
        slot_id: slot.id,
        round,
        response: 'pending',
      }));

      const { error: logErr } = await supabase.from('dispatch_logs').insert(logs);
      if (logErr) {
        console.error(`dispatch_logs insert error for slot ${slot.id}:`, logErr);
        continue;
      }

      // Mark slot as dispatching
      await supabase
        .from('project_slots')
        .update({ status: 'dispatching' })
        .eq('id', slot.id);

      // Send notifications to matched companies
      const notifications = eligible.map((c) => ({
        user_id: c.user_id,
        type: 'slot_dispatched',
        payload: {
          project_id,
          slot_id: slot.id,
          trade_type: slot.trade_type,
          description: slot.description,
          room_type: project.room_type,
          city: project.city,
          province: project.province,
          estimated_cost_min: slot.estimated_cost_min,
          estimated_cost_max: slot.estimated_cost_max,
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          deep_link: `/(company)/job/${project_id}?slot=${slot.id}`,
        },
      }));

      await supabase.from('notifications').insert(notifications);
      results.push({ slot_id: slot.id, trade_type: slot.trade_type, dispatched: eligible.length });
    }

    // Update project to dispatching status
    await supabase
      .from('projects')
      .update({ status: 'dispatching' })
      .eq('id', project_id);

    return new Response(
      JSON.stringify({ success: true, round, radius_km: radiusKm, slots: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('dispatch-slots error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getRadiusForRound(round: number): number {
  const radii: Record<number, number> = { 1: 50, 2: 75, 3: 100, 4: 150 };
  return radii[round] ?? 150;
}
