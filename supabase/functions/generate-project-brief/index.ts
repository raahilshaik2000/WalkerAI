import { createClient } from 'jsr:@supabase/supabase-js@2';

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices[0].message.content as string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CAD cents — regional labour cost baselines
const CANADIAN_COST_RANGES: Record<string, Record<string, { min: number; max: number }>> = {
  ON: { kitchen: { min: 2500000, max: 7500000 }, bathroom: { min: 800000, max: 2500000 } },
  BC: { kitchen: { min: 2800000, max: 8500000 }, bathroom: { min: 900000, max: 2800000 } },
  AB: { kitchen: { min: 2200000, max: 6500000 }, bathroom: { min: 750000, max: 2200000 } },
  QC: { kitchen: { min: 2000000, max: 6000000 }, bathroom: { min: 700000, max: 2000000 } },
  MB: { kitchen: { min: 1800000, max: 5500000 }, bathroom: { min: 650000, max: 1800000 } },
  SK: { kitchen: { min: 1800000, max: 5000000 }, bathroom: { min: 600000, max: 1700000 } },
  NS: { kitchen: { min: 2000000, max: 5500000 }, bathroom: { min: 700000, max: 2000000 } },
  NB: { kitchen: { min: 1900000, max: 5000000 }, bathroom: { min: 650000, max: 1800000 } },
  NL: { kitchen: { min: 1900000, max: 5000000 }, bathroom: { min: 650000, max: 1800000 } },
  PE: { kitchen: { min: 1800000, max: 4500000 }, bathroom: { min: 600000, max: 1600000 } },
};

const DEFAULT_COST = { min: 2000000, max: 6000000 };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

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

    const { project_id, analysis, questionnaire_answers, province, custom_prompt, forced_cost_min, forced_cost_max } = await req.json();

    const { data: project } = await adminClient
      .from('projects')
      .select('id, room_type, homeowner_id, province')
      .eq('id', project_id)
      .single();

    if (!project || project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const roomType = project.room_type ?? 'kitchen';
    const provinceCode = (province ?? project.province ?? 'ON').toUpperCase();

    // Use caller-provided prompt if available (client has richer pricing logic),
    // otherwise fall back to the server-side auto-generated prompt.
    let promptToUse: string;
    if (custom_prompt) {
      promptToUse = custom_prompt;
    } else {
      const regionalCosts =
        CANADIAN_COST_RANGES[provinceCode]?.[roomType] ??
        (roomType === 'kitchen' ? DEFAULT_COST : { min: 700000, max: 2000000 });
      promptToUse = `Generate a detailed renovation project brief for a ${roomType} in ${provinceCode}, Canada.

Room Analysis: ${JSON.stringify(analysis)}
Homeowner Preferences (questionnaire answers): ${JSON.stringify(questionnaire_answers)}

Regional cost baseline (CAD cents): min=${regionalCosts.min}, max=${regionalCosts.max}

Return a valid JSON object with this exact structure:
{
  "materials": [
    { "item": "string", "quantity": number, "unit": "string", "quality_tier": "budget|mid-range|luxury" }
  ],
  "scope_of_work": [
    { "phase": "demolition|rough-in|installation|finishing", "description": "string", "sort_order": number }
  ],
  "ai_cost_min": number,
  "ai_cost_max": number,
  "permits": [
    { "permit_type": "string", "required": true|false }
  ],
  "ai_observations": "2-3 sentence summary for the homeowner"
}

Rules:
- ai_cost_min and ai_cost_max must be in CAD cents and within ±30% of regional baseline
- Adjust cost based on quality_tier preferences from questionnaire
- Include realistic Canadian permit requirements (building permit, plumbing, electrical as needed)
- Materials should reflect the quality tier selected
- scope_of_work must cover all phases in order
- Return ONLY the JSON, no markdown`;
    }

    const rawText = await callOpenAI(promptToUse, Deno.env.get('OPENAI_API_KEY')!);

    let brief: {
      materials: unknown[];
      scope_of_work: unknown[];
      ai_cost_min: number;
      ai_cost_max: number;
      permits: unknown[];
      ai_observations: string;
    };

    try {
      brief = JSON.parse(rawText.trim());
    } catch {
      const stripped = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      brief = JSON.parse(stripped);
    }

    // Caller may supply pre-calculated costs from a local pricing engine — trust those over AI-generated
    if (forced_cost_min !== undefined) brief.ai_cost_min = forced_cost_min;
    if (forced_cost_max !== undefined) brief.ai_cost_max = forced_cost_max;

    // Persist all generated data
    await Promise.all([
      // Update project with cost estimate
      adminClient
        .from('projects')
        .update({
          ai_cost_min: brief.ai_cost_min,
          ai_cost_max: brief.ai_cost_max,
          questionnaire_answers,
        })
        .eq('id', project_id),

      // Insert materials
      brief.materials.length > 0
        ? adminClient.from('materials').insert(
            (brief.materials as Array<{ item: string; quantity: number; unit: string; quality_tier: string }>)
              .map((m) => ({ ...m, project_id }))
          )
        : Promise.resolve(),

      // Insert scope of work
      brief.scope_of_work.length > 0
        ? adminClient.from('scope_of_work').insert(
            (brief.scope_of_work as Array<{ phase: string; description: string; sort_order: number }>)
              .map((s) => ({ ...s, project_id }))
          )
        : Promise.resolve(),

      // Insert permits
      brief.permits.length > 0
        ? adminClient.from('permits').insert(
            (brief.permits as Array<{ permit_type: string }>)
              .map((p) => ({
                project_id,
                permit_type: p.permit_type,
                status: 'not_applied',
              }))
          )
        : Promise.resolve(),
    ]);

    return new Response(
      JSON.stringify({ success: true, ...brief }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('generate-project-brief error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
