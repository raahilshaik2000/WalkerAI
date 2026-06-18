import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from 'npm:openai@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_TRADES = [
  'plumber', 'electrician', 'tile_installer',
  'cabinet_installer', 'painter', 'flooring_installer',
  'drywall', 'demolition',
] as const;

type TradeType = typeof VALID_TRADES[number];
type GcProjectType = 'kitchen' | 'bathroom' | 'flooring' | 'painting' | 'basement' | 'addition' | 'other';

interface TradeSlot {
  trade_type: TradeType;
  description: string;
  estimated_cost_min: number; // CAD cents
  estimated_cost_max: number; // CAD cents
}

function isGcProjectType(value: unknown): value is GcProjectType {
  return typeof value === 'string'
    && ['kitchen', 'bathroom', 'flooring', 'painting', 'basement', 'addition', 'other'].includes(value);
}

function formatProjectType(projectType: string) {
  return projectType.replace(/_/g, ' ');
}

function slotCost(total: number, weight: number) {
  return Math.max(1, Math.round(total * weight));
}

function weightedTradeSlot(
  tradeType: TradeType,
  description: string,
  totalMin: number,
  totalMax: number,
  weight: number,
): TradeSlot {
  return {
    trade_type: tradeType,
    description,
    estimated_cost_min: slotCost(totalMin, weight),
    estimated_cost_max: slotCost(totalMax, weight),
  };
}

function fallbackTradeSlots(projectType: string, totalMin: number, totalMax: number): TradeSlot[] {
  if (projectType === 'bathroom') {
    return [
      weightedTradeSlot('demolition', 'Bathroom demolition, disposal, and site preparation for the renovation scope.', totalMin, totalMax, 0.15),
      weightedTradeSlot('plumber', 'Bathroom plumbing rough-in, fixture connections, and code-ready plumbing work.', totalMin, totalMax, 0.25),
      weightedTradeSlot('electrician', 'Bathroom electrical rough-in, lighting, fan, GFCI, and device installation.', totalMin, totalMax, 0.15),
      weightedTradeSlot('tile_installer', 'Bathroom waterproofing, tile installation, grout, and finish detailing.', totalMin, totalMax, 0.30),
      weightedTradeSlot('painter', 'Bathroom surface preparation, priming, painting, and final touch-ups.', totalMin, totalMax, 0.15),
    ];
  }

  if (projectType === 'kitchen') {
    return [
      weightedTradeSlot('demolition', 'Kitchen demolition, disposal, and site preparation for the renovation scope.', totalMin, totalMax, 0.15),
      weightedTradeSlot('plumber', 'Kitchen plumbing rough-in, sink, faucet, dishwasher, and connection work.', totalMin, totalMax, 0.15),
      weightedTradeSlot('electrician', 'Kitchen electrical rough-in, lighting, outlet, appliance, and device work.', totalMin, totalMax, 0.15),
      weightedTradeSlot('cabinet_installer', 'Kitchen cabinet installation, alignment, trim, and finish coordination.', totalMin, totalMax, 0.25),
      weightedTradeSlot('tile_installer', 'Kitchen backsplash or tile scope installation and finish detailing.', totalMin, totalMax, 0.15),
      weightedTradeSlot('painter', 'Kitchen surface preparation, painting, and final touch-ups.', totalMin, totalMax, 0.15),
    ];
  }

  return [
    weightedTradeSlot('demolition', `Demolition, disposal, and site preparation for the ${formatProjectType(projectType)} scope.`, totalMin, totalMax, 0.20),
    weightedTradeSlot('drywall', `Drywall, patching, finishing, and surface preparation for the ${formatProjectType(projectType)} scope.`, totalMin, totalMax, 0.25),
    weightedTradeSlot('electrician', `Electrical coordination, rough-in, fixture, or device work for the ${formatProjectType(projectType)} scope.`, totalMin, totalMax, 0.20),
    weightedTradeSlot('flooring_installer', `Flooring preparation, installation, transitions, and finish details for the ${formatProjectType(projectType)} scope.`, totalMin, totalMax, 0.20),
    weightedTradeSlot('painter', `Painting, final finish work, and touch-ups for the ${formatProjectType(projectType)} scope.`, totalMin, totalMax, 0.15),
  ];
}

function deterministicSlotsForGcProjectType(
  projectType: GcProjectType,
  totalMin: number,
  totalMax: number,
): TradeSlot[] {
  if (projectType === 'flooring') {
    return [{
      trade_type: 'flooring_installer',
      description: 'Flooring installation scope, including layout coordination, installation, transitions, and site cleanup.',
      estimated_cost_min: totalMin,
      estimated_cost_max: totalMax,
    }];
  }

  if (projectType === 'painting') {
    return [{
      trade_type: 'painter',
      description: 'Painting scope, including surface preparation, priming, paint application, and cleanup.',
      estimated_cost_min: totalMin,
      estimated_cost_max: totalMax,
    }];
  }

  if (projectType === 'basement') {
    return [
      weightedTradeSlot('demolition', 'Basement demolition, disposal, and site preparation for the renovation scope.', totalMin, totalMax, 0.15),
      weightedTradeSlot('drywall', 'Basement wall and ceiling drywall installation, finishing, and patch preparation.', totalMin, totalMax, 0.30),
      weightedTradeSlot('electrician', 'Basement electrical rough-in, fixture/device installation, and code-ready electrical work.', totalMin, totalMax, 0.20),
      weightedTradeSlot('flooring_installer', 'Basement flooring preparation, installation, transitions, and finish details.', totalMin, totalMax, 0.20),
      weightedTradeSlot('painter', 'Basement surface preparation, painting, and final finish touch-ups.', totalMin, totalMax, 0.15),
    ];
  }

  if (projectType === 'addition') {
    return [
      weightedTradeSlot('demolition', 'Addition demolition, opening preparation, disposal, and site protection.', totalMin, totalMax, 0.15),
      weightedTradeSlot('electrician', 'Addition electrical rough-in, panel/device coordination, fixture installation, and inspection-ready work.', totalMin, totalMax, 0.20),
      weightedTradeSlot('drywall', 'Addition drywall installation, finishing, patching, and paint-ready surface preparation.', totalMin, totalMax, 0.25),
      weightedTradeSlot('flooring_installer', 'Flooring installation and transitions for the addition scope.', totalMin, totalMax, 0.20),
      weightedTradeSlot('painter', 'Addition surface preparation, painting, and final finish touch-ups.', totalMin, totalMax, 0.20),
    ];
  }

  if (projectType === 'other') {
    return fallbackTradeSlots(projectType, totalMin, totalMax);
  }

  return [];
}

type JoinedGcProfile = {
  user_id: string | null;
  verified: boolean | null;
  business_name: string | null;
  city: string | null;
  province: string | null;
  lat: number | null;
  lng: number | null;
  license_number: string | null;
  license_doc_url: string | null;
  insurance_doc_url: string | null;
};

function getJoinedGcProfile(row: { general_contractors?: JoinedGcProfile | JoinedGcProfile[] | null }) {
  return Array.isArray(row.general_contractors)
    ? row.general_contractors[0] ?? null
    : row.general_contractors ?? null;
}

function hasCompleteGcWorkflowProfile(gc: JoinedGcProfile | null | undefined) {
  return gc?.verified === true
    && !!gc.business_name?.trim()
    && !!gc.city?.trim()
    && !!gc.province?.trim()
    && typeof gc.lat === 'number'
    && typeof gc.lng === 'number'
    && !!gc.license_number?.trim()
    && !!gc.license_doc_url?.trim()
    && !!gc.insurance_doc_url?.trim();
}

async function isActiveGeneralContractorForProject(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from('general_contractor_projects')
    .select(`
      id,
      general_contractors!inner (
        user_id, verified, business_name, city, province, lat, lng,
        license_number, license_doc_url, insurance_doc_url
      )
    `)
    .eq('project_id', projectId)
    .eq('status', 'active')
    .eq('general_contractors.user_id', userId)
    .eq('general_contractors.verified', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const gc = data ? getJoinedGcProfile(data as { general_contractors?: JoinedGcProfile | JoinedGcProfile[] | null }) : null;
  if (!hasCompleteGcWorkflowProfile(gc)) return false;

  const { data: appUser, error: appUserError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (appUserError) throw appUserError;
  return appUser?.role === 'general_contractor';
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
    const { project_id }: { project_id: string } = await req.json();
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

    // Load project with AI analysis, questionnaire answers, materials, scope
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, homeowner_id, room_type, status, ai_analysis, questionnaire_answers, ai_cost_min, ai_cost_max')
      .eq('id', project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!isServiceRoleCall) {
      const requesterIsHomeowner = project.homeowner_id === requesterId;
      const requesterIsActiveGc = requesterId
        ? await isActiveGeneralContractorForProject(supabase, project_id, requesterId)
        : false;
      if (!requesterIsHomeowner && !requesterIsActiveGc) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!['draft', 'brief_ready'].includes(project.status)) {
      return new Response(JSON.stringify({ error: 'Trade slots can only be generated before contractor dispatch starts' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: materials, error: materialsError } = await supabase
      .from('materials')
      .select('item, quantity, unit, quality_tier')
      .eq('project_id', project_id);
    if (materialsError) throw materialsError;

    const { data: scope, error: scopeError } = await supabase
      .from('scope_of_work')
      .select('phase, description')
      .eq('project_id', project_id)
      .order('sort_order');
    if (scopeError) throw scopeError;

    const analysis = project.ai_analysis ?? {};
    const answers = project.questionnaire_answers ?? {};
    const totalMin = project.ai_cost_min ?? 0;
    const totalMax = project.ai_cost_max ?? 0;

    if (!Number.isFinite(totalMin) || !Number.isFinite(totalMax) || totalMin <= 0 || totalMax <= 0) {
      return new Response(JSON.stringify({ error: 'Project budget is missing. Generate the project brief before dispatching.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: gcProjectRows, error: gcProjectError } = await supabase
      .from('general_contractor_projects')
      .select('project_type')
      .eq('project_id', project_id)
      .neq('status', 'removed')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (gcProjectError) throw gcProjectError;

    const gcProjectType = isGcProjectType(gcProjectRows?.[0]?.project_type)
      ? gcProjectRows[0].project_type
      : null;
    const projectType = gcProjectType ?? (project.room_type === 'bathroom' ? 'bathroom' : 'kitchen');
    const deterministicGcSlots = gcProjectType && !['kitchen', 'bathroom'].includes(gcProjectType)
      ? deterministicSlotsForGcProjectType(gcProjectType, totalMin, totalMax)
      : [];

    const prompt = `You are a renovation project manager. Given the following ${formatProjectType(projectType)} renovation details, determine which trades are required and estimate their cost range.

Project type: ${formatProjectType(projectType)}
AI analysis: ${JSON.stringify(analysis)}
Homeowner answers: ${JSON.stringify(answers)}
Scope of work: ${JSON.stringify(scope ?? [])}
Materials: ${JSON.stringify(materials ?? [])}
Total project estimate: $${(totalMin / 100).toFixed(0)}–$${(totalMax / 100).toFixed(0)} CAD

Valid trade types: ${VALID_TRADES.join(', ')}

Return a JSON object in this exact shape:
{
  "trades": [
    {
      "trade_type": "one valid trade type",
      "description": "1-2 sentence scope description",
      "estimated_cost_min": 1000,
      "estimated_cost_max": 2000
    }
  ]
}

Each trade object must have:
- trade_type: one of the valid trade types above
- description: 1-2 sentence scope description for that trade
- estimated_cost_min: minimum cost in CAD dollars (integer)
- estimated_cost_max: maximum cost in CAD dollars (integer)

Only include trades that are genuinely required for this renovation. Do not include unnecessary trades.
Return ONLY valid JSON, no markdown.`;

    let slots: TradeSlot[] = deterministicGcSlots;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (slots.length === 0 && openaiApiKey) {
      try {
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
        // Accept either { trades: [...] } or [...]
        const raw = Array.isArray(parsed) ? parsed : (parsed.trades ?? []);
        slots = raw
          .filter((s: Partial<TradeSlot>) => VALID_TRADES.includes(s.trade_type as TradeType))
          .map((s: Partial<TradeSlot>) => {
            const minCents = Math.round((Number(s.estimated_cost_min) || 0) * 100);
            const maxCents = Math.round((Number(s.estimated_cost_max) || 0) * 100);
            return {
              trade_type: s.trade_type!,
              description: s.description ?? '',
              estimated_cost_min: minCents,
              estimated_cost_max: maxCents >= minCents ? maxCents : minCents,
            };
          })
          .filter((s: TradeSlot) => s.estimated_cost_min > 0 && s.estimated_cost_max > 0);
      } catch (slotError) {
        console.error('OpenAI trade slot generation failed, using fallback:', slotError);
      }
    }

    if (slots.length === 0) {
      slots = fallbackTradeSlots(projectType, totalMin, totalMax);
    }

    // Delete any existing dispatch attempts and slots for this project
    // (idempotent). Dispatch logs reference slots without ON DELETE CASCADE,
    // so stale failed-search logs must be cleared before regenerating slots.
    const { error: logDeleteErr } = await supabase.from('dispatch_logs').delete().eq('project_id', project_id);
    if (logDeleteErr) throw logDeleteErr;

    const { error: deleteErr } = await supabase.from('project_slots').delete().eq('project_id', project_id);
    if (deleteErr) throw deleteErr;

    // Insert new slots
    const { data: inserted, error: insertErr } = await supabase
      .from('project_slots')
      .insert(slots.map((s) => ({ ...s, project_id, status: 'open' })))
      .select('id, trade_type, description, estimated_cost_min, estimated_cost_max, status');

    if (insertErr) throw insertErr;

    return new Response(
      JSON.stringify({ success: true, slots: inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('generate-trade-slots error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
