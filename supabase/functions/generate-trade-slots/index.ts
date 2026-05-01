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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });

  try {
    const { project_id }: { project_id: string } = await req.json();

    // Load project with AI analysis, questionnaire answers, materials, scope
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, room_type, ai_analysis, questionnaire_answers, ai_cost_min, ai_cost_max')
      .eq('id', project_id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: materials } = await supabase
      .from('materials')
      .select('item, quantity, unit, quality_tier')
      .eq('project_id', project_id);

    const { data: scope } = await supabase
      .from('scope_of_work')
      .select('phase, description')
      .eq('project_id', project_id)
      .order('sort_order');

    const analysis = project.ai_analysis ?? {};
    const answers = project.questionnaire_answers ?? {};
    const totalMin = project.ai_cost_min ?? 0;
    const totalMax = project.ai_cost_max ?? 0;

    const prompt = `You are a renovation project manager. Given the following ${project.room_type} renovation details, determine which trades are required and estimate their cost range.

Room type: ${project.room_type}
AI analysis: ${JSON.stringify(analysis)}
Homeowner answers: ${JSON.stringify(answers)}
Scope of work: ${JSON.stringify(scope ?? [])}
Materials: ${JSON.stringify(materials ?? [])}
Total project estimate: $${(totalMin / 100).toFixed(0)}–$${(totalMax / 100).toFixed(0)} CAD

Valid trade types: ${VALID_TRADES.join(', ')}

Return a JSON array of required trades. Each object must have:
- trade_type: one of the valid trade types above
- description: 1-2 sentence scope description for that trade
- estimated_cost_min: minimum cost in CAD dollars (integer)
- estimated_cost_max: maximum cost in CAD dollars (integer)

Only include trades that are genuinely required for this renovation. Do not include unnecessary trades.
Return ONLY valid JSON, no markdown.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    let slots: TradeSlot[] = [];
    try {
      const parsed = JSON.parse(completion.choices[0].message.content ?? '{}');
      // Accept either { trades: [...] } or [...]
      const raw = Array.isArray(parsed) ? parsed : (parsed.trades ?? []);
      slots = raw
        .filter((s: Partial<TradeSlot>) => VALID_TRADES.includes(s.trade_type as TradeType))
        .map((s: Partial<TradeSlot>) => ({
          trade_type: s.trade_type!,
          description: s.description ?? '',
          estimated_cost_min: Math.round((s.estimated_cost_min ?? 0) * 100), // convert to cents
          estimated_cost_max: Math.round((s.estimated_cost_max ?? 0) * 100),
        }));
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    // Delete any existing slots for this project (idempotent)
    await supabase.from('project_slots').delete().eq('project_id', project_id);

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
