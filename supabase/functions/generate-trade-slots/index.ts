import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from 'npm:openai@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_TRADES = [
  'general_contractor', 'plumber', 'electrician',
  'tile_installer', 'cabinet_installer', 'painter',
  'flooring_installer', 'drywall', 'demolition',
] as const;

type TradeType = typeof VALID_TRADES[number];

interface TradeSlot {
  trade_type: TradeType;
  description: string;
  estimated_cost_min: number; // CAD cents
  estimated_cost_max: number; // CAD cents
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
    if (!isServiceRoleCall && project.homeowner_id !== requesterId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const prompt = `You are a renovation project manager. Given the following ${project.room_type} renovation details, determine which trades are required and estimate their cost range.

Room type: ${project.room_type}
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

    let slots: TradeSlot[] = [];
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (openaiApiKey) {
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
      // Fallback: general contractor covers everything
      slots = [{
        trade_type: 'general_contractor',
        description: `Full ${project.room_type} renovation including all labour and coordination.`,
        estimated_cost_min: totalMin,
        estimated_cost_max: totalMax,
      }];
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
