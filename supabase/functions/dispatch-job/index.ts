import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DispatchJobBody {
  project_id: string;
  round?: number;
}

interface NearbyCompany {
  company_id: string;
  distance_km: number;
  user_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // Service role — bypasses RLS
  );

  try {
    const { project_id, round = 1 }: DispatchJobBody = await req.json();

    // Load project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, lat, lng, room_type, address, city, province, ai_cost_min, ai_cost_max, dispatch_radius_km, homeowner_id')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine radius for this round
    const radiusKm = getRadiusForRound(round);

    // Find nearest verified companies within radius
    // Uses PostGIS function from schema — excludes already-dispatched companies
    const { data: nearbyCompanies, error: geoError } = await supabase.rpc(
      'companies_within_radius',
      {
        project_lat: project.lat,
        project_lng: project.lng,
        radius_km: radiusKm,
      }
    ) as { data: NearbyCompany[] | null; error: unknown };

    if (geoError) throw geoError;

    if (!nearbyCompanies || nearbyCompanies.length === 0) {
      // No companies in range — notify homeowner and stop
      await supabase.from('notifications').insert({
        user_id: project.homeowner_id,
        type: 'dispatch_no_match',
        payload: {
          project_id,
          message: 'No verified contractors are currently available in your area. Please try again later.',
          deep_link: `/(homeowner)/project/${project_id}`,
        },
      });

      await supabase
        .from('projects')
        .update({ status: 'brief_ready', updated_at: new Date().toISOString() })
        .eq('id', project_id);

      return new Response(JSON.stringify({ dispatched: 0, no_companies: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Exclude companies already dispatched for this project (any round)
    const { data: alreadyDispatched } = await supabase
      .from('dispatch_logs')
      .select('company_id')
      .eq('project_id', project_id);

    const alreadyDispatchedIds = new Set((alreadyDispatched ?? []).map((d: { company_id: string }) => d.company_id));
    const eligibleCompanies = nearbyCompanies.filter(
      (c: NearbyCompany) => !alreadyDispatchedIds.has(c.company_id)
    );

    if (eligibleCompanies.length === 0) {
      // All nearby companies already dispatched — expand radius further
      return await expandOrGiveUp(supabase, project, project_id, round);
    }

    // Insert dispatch log records
    const dispatchLogs = eligibleCompanies.map((c: NearbyCompany) => ({
      project_id,
      company_id: c.company_id,
      round,
      dispatched_at: new Date().toISOString(),
      response: 'pending',
    }));

    const { error: logError } = await supabase.from('dispatch_logs').insert(dispatchLogs);
    if (logError) throw logError;

    // Get company user_ids to fetch their active device tokens
    const companyUserIds = eligibleCompanies.map((c: NearbyCompany) => c.company_id);

    // Insert notification records for each company
    // DB trigger handles push delivery via send-push Edge Function
    const notifications = eligibleCompanies.map((c: NearbyCompany) => ({
      user_id: c.user_id,
      type: 'job_dispatched',
      payload: {
        project_id,
        room_type: project.room_type,
        city: project.city,
        province: project.province,
        ai_cost_min: project.ai_cost_min,
        ai_cost_max: project.ai_cost_max,
        distance_km: nearbyCompanies.find((n: NearbyCompany) => n.company_id === c.company_id)?.distance_km,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        deep_link: `/(company)/job/${project_id}`,
      },
    }));

    await supabase.from('notifications').insert(notifications);

    // Update project status and dispatch metadata
    await supabase.from('projects').update({
      status: 'dispatching',
      dispatch_round: round,
      dispatch_radius_km: radiusKm,
      dispatch_expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', project_id);

    return new Response(
      JSON.stringify({
        dispatched: eligibleCompanies.length,
        round,
        radius_km: radiusKm,
        company_ids: companyUserIds,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('dispatch-job error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function getRadiusForRound(round: number): number {
  // Progressive radius expansion
  const radii: Record<number, number> = {
    1: 50,
    2: 75,
    3: 100,
    4: 150,
  };
  return radii[round] ?? 150;
}

async function expandOrGiveUp(
  supabase: ReturnType<typeof createClient>,
  project: { homeowner_id: string },
  project_id: string,
  currentRound: number
) {
  const MAX_ROUNDS = 4;

  if (currentRound >= MAX_ROUNDS) {
    // Give up — notify homeowner
    await supabase.from('notifications').insert({
      user_id: project.homeowner_id,
      type: 'dispatch_no_match',
      payload: {
        project_id,
        message: 'We couldn\'t find an available contractor in your area. Our team will follow up.',
        deep_link: `/(homeowner)/project/${project_id}`,
      },
    });
    await supabase.from('projects').update({ status: 'brief_ready' }).eq('id', project_id);
    return new Response(JSON.stringify({ dispatched: 0, max_rounds_reached: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Signal caller to retry with next round (expand-dispatch cron handles this)
  return new Response(JSON.stringify({ dispatched: 0, needs_expansion: true, next_round: currentRound + 1 }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
