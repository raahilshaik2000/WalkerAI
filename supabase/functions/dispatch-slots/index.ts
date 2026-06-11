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

interface MatchedCompany {
  id: string;
  user_id: string;
  service_radius_km?: number | null;
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

function withinCompanyServiceRadius(company: MatchedCompany, distanceByCompanyId: Map<string, number>) {
  const distanceKm = distanceByCompanyId.get(company.id);
  const serviceRadiusKm = Number(company.service_radius_km);
  if (!Number.isFinite(distanceKm) || !Number.isFinite(serviceRadiusKm) || serviceRadiusKm <= 0) return true;
  return distanceKm <= serviceRadiusKm;
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

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const isServiceRoleCall = authHeader === `Bearer ${serviceRoleKey}`;
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  );

  try {
    const { project_id, round = 1 }: DispatchSlotsBody = await req.json();
    if (!project_id) throw new Error('project_id required');

    let requesterId: string | null = null;
    if (!isServiceRoleCall) {
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      requesterId = user.id;
    }

    const radiusKm = getRadiusForRound(round);

    // Load project location + homeowner
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, lat, lng, homeowner_id, room_type, city, province, status, ai_cost_min, ai_cost_max')
      .eq('id', project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isServiceRoleCall && project.homeowner_id !== requesterId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['draft', 'brief_ready', 'dispatching'].includes(project.status)) {
      return new Response(JSON.stringify({ error: 'Project must have a generated brief before contractor dispatch can start' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const totalMin = project.ai_cost_min ?? 0;
    const totalMax = project.ai_cost_max ?? 0;
    if (!Number.isFinite(totalMin) || !Number.isFinite(totalMax) || totalMin <= 0 || totalMax <= 0 || totalMax < totalMin) {
      return new Response(JSON.stringify({ error: 'Project budget is missing. Generate the project brief before dispatching.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (project.lat == null || project.lng == null) {
      return new Response(
        JSON.stringify({
          success: false,
          dispatched: 0,
          message: 'Project address is missing map coordinates. Select a suggested address before dispatching.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load slots that still need a company. A previously-dispatched slot remains
    // "dispatching" while waiting for responses, and should be eligible for
    // radius expansion after the dispatch window expires.
    const { data: openSlots, error: openSlotsError } = await supabase
      .from('project_slots')
      .select('id, trade_type, description, estimated_cost_min, estimated_cost_max')
      .eq('project_id', project_id)
      .in('status', ['open', 'dispatching']);
    if (openSlotsError) throw openSlotsError;

    if (!openSlots || openSlots.length === 0) {
      return new Response(
        JSON.stringify({ dispatched: 0, message: 'No slots need dispatch' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find nearby companies for each slot's trade type
    const results: { slot_id: string; trade_type: string; dispatched: number }[] = [];
    const dispatchExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    for (const slot of openSlots) {
      // Find companies with matching trade type within radius
      const { data: nearby, error: nearbyError } = await supabase.rpc('companies_within_radius', {
        project_lat: project.lat,
        project_lng: project.lng,
        radius_km: radiusKm,
      }) as { data: NearbyCompany[] | null; error: { message: string } | null };
      if (nearbyError) throw nearbyError;

      if (!nearby || nearby.length === 0) continue;
      const distanceByCompanyId = new Map(nearby.map((n) => [n.company_id, n.distance_km]));

      // Prefer exact trade matches. If no specialist is available, fall back to general contractors.
      let matchedCompanies: MatchedCompany[] | null = null;
      let matchedCompaniesError: { message: string } | null = null;
      const exactMatch = await supabase
        .from('companies')
        .select('id, user_id, trade_types, service_radius_km')
        .in('id', nearby.map((n) => n.company_id))
        .filter('trade_types', 'cs', `{${slot.trade_type}}`);
      matchedCompanies = exactMatch.data;
      matchedCompaniesError = exactMatch.error;
      if (isMissingColumnError(matchedCompaniesError)) {
        const legacyMatched = await supabase
          .from('companies')
          .select('id, user_id, service_radius_km')
          .in('id', nearby.map((n) => n.company_id));
        if (legacyMatched.error) throw legacyMatched.error;
        matchedCompanies = legacyMatched.data;
        matchedCompaniesError = null;
      }
      if (matchedCompaniesError) throw matchedCompaniesError;

      if (!matchedCompanies || matchedCompanies.length === 0) {
        const fallback = await supabase
          .from('companies')
          .select('id, user_id, trade_types, service_radius_km')
          .in('id', nearby.map((n) => n.company_id))
          .filter('trade_types', 'cs', '{general_contractor}');

        if (isMissingColumnError(fallback.error)) {
          const legacyFallback = await supabase
            .from('companies')
            .select('id, user_id, service_radius_km')
            .in('id', nearby.map((n) => n.company_id));
          if (legacyFallback.error) throw legacyFallback.error;
          matchedCompanies = legacyFallback.data;
        } else if (fallback.error) {
          throw fallback.error;
        } else {
          matchedCompanies = fallback.data;
        }
      }

      if (!matchedCompanies || matchedCompanies.length === 0) continue;

      // Exclude companies already dispatched for this slot
      const { data: alreadyDispatched, error: alreadyDispatchedError } = await supabase
        .from('dispatch_logs')
        .select('company_id')
        .eq('slot_id', slot.id);
      if (alreadyDispatchedError) throw alreadyDispatchedError;

      const dispatchedIds = new Set((alreadyDispatched ?? []).map((d: { company_id: string }) => d.company_id));
      const eligible = matchedCompanies.filter((c) =>
        !dispatchedIds.has(c.id) && withinCompanyServiceRadius(c, distanceByCompanyId)
      );

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
        throw logErr;
      }

      // Mark slot as dispatching
      const { error: slotUpdateErr } = await supabase
        .from('project_slots')
        .update({ status: 'dispatching' })
        .eq('id', slot.id);
      if (slotUpdateErr) throw slotUpdateErr;

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
          expires_at: dispatchExpiresAt,
          deep_link: `/(company)/job/${project_id}?slot=${slot.id}`,
        },
      }));

      const { error: notifErr } = await supabase.from('notifications').insert(notifications);
      if (notifErr) {
        console.warn(`dispatch notification insert failed for slot ${slot.id}:`, notifErr.message);
      }
      results.push({ slot_id: slot.id, trade_type: slot.trade_type, dispatched: eligible.length });
    }

    const dispatchedTotal = results.reduce((sum, result) => sum + result.dispatched, 0);

    if (dispatchedTotal === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          dispatched: 0,
          round,
          radius_km: radiusKm,
          slots: results,
          message: 'No verified companies matched this project yet. Check company trade types, verification, and service area.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update project to dispatching status once at least one company was notified.
    const { error: projectUpdateErr } = await supabase
      .from('projects')
      .update({
        status: 'dispatching',
        dispatch_round: round,
        dispatch_expires_at: dispatchExpiresAt,
      })
      .eq('id', project_id);
    if (projectUpdateErr) throw projectUpdateErr;

    return new Response(
      JSON.stringify({ success: true, dispatched: dispatchedTotal, round, radius_km: radiusKm, slots: results }),
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
