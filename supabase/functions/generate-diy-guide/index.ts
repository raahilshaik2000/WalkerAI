import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

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

    const {
      project_id,
      photo_urls,
      description,
      category,
      budget_min,
      budget_max,
      skill_level,
      tools_available,
      timeline,
    } = await req.json();

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    // Convert photos to base64
    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    for (const url of (photo_urls ?? []).slice(0, 6)) {
      try {
        const b64 = await urlToBase64(url);
        imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } });
      } catch (e) {
        console.error('Image fetch failed, skipping:', e);
      }
    }

    const budgetLabel = budget_max >= 5000
      ? '$1,000+'
      : `$${budget_min}–$${budget_max}`;

    const isHazardous = category === 'plumbing' || category === 'electrical';
    const isRoomReno = ['kitchen', 'bathroom', 'bedroom', 'living room', 'basement', 'general'].includes((category ?? '').toLowerCase());

    const hazardPreamble = isHazardous ? `
IMPORTANT — SAFETY AND LICENSING NOTICE:
This task involves ${category} work. You MUST:
1. Include a prominent safety warning in "safety_warnings" that reads: "We strongly recommend hiring a licensed ${category === 'plumbing' ? 'plumber' : 'electrician'} for this work. Improper ${category} work can cause serious injury, property damage, flooding, fires, or death."
2. Set "when_to_call_pro" to strongly advise hiring a licensed trade for anything beyond minor maintenance.
3. Make the VERY FIRST step a safety shut-off step:
   ${category === 'plumbing' ? '- Step 1: Turn off the water supply at the main shutoff valve or the local isolation valve. Open the lowest tap in the house to drain the lines.' : '- Step 1: Turn off the circuit breaker at the main panel. Use a non-contact voltage tester to confirm the power is off before touching any wires.'}
4. If the homeowner proceeds despite the warning, provide accurate and safe DIY steps.
` : '';

    const roomDesignNote = isRoomReno ? `
DESIGN GUIDANCE:
For room renovation tasks, include design recommendations in the overview and relevant steps. Suggest colour palettes, fixture styles, layout improvements, and material combinations that would work well based on what you see in the photos.
` : '';

    const prompt = `You are an expert home improvement guide creator. Analyze the photos provided and create a detailed, practical DIY guide.
${hazardPreamble}${roomDesignNote}
Project details:
- Task: ${description}
- Category: ${category}
- Budget: ${budgetLabel}
- Skill level: ${skill_level}
- Timeline: ${timeline}
- Tools available: ${tools_available || 'not specified'}

Return a valid JSON object with EXACTLY this structure:
{
  "title": "Concise action-oriented title (max 8 words)",
  "overview": "2-3 sentence overview of what this guide covers and the approach${isRoomReno ? '. Include a design recommendation if applicable.' : ''}",
  "estimated_time": "e.g. 2–3 hours",
  "difficulty": "Beginner | Intermediate | Advanced",
  "recommend_pro": ${isHazardous ? 'true' : 'false'},
  "safety_warnings": ["string", "string"],
  "steps": [
    {
      "step_number": 1,
      "title": "Short step title",
      "description": "Detailed description of what to do in this step",
      "tip": "Optional pro tip or shortcut (null if none)",
      "warning": "Optional safety or common mistake warning (null if none)"
    }
  ],
  "materials": [
    {
      "name": "Item name",
      "quantity": "1",
      "estimated_cost": "$10–15",
      "where_to_buy": "Home Depot / hardware store",
      "is_tool": true
    }
  ],
  "when_to_call_pro": "Specific situations where a professional should be hired instead",
  "total_estimated_cost": "$50–120"
}

Requirements:
- 5–12 steps depending on complexity
- Separate tools (is_tool: true) from materials/supplies (is_tool: false)
- Tailor complexity and language to ${skill_level} skill level
- Respect the ${budgetLabel} budget — suggest affordable alternatives where possible
- Base steps on what you actually see in the photos
${isHazardous ? `- First step MUST be the safety shut-off procedure described above
- safety_warnings MUST include the professional recommendation` : ''}
- Return ONLY the JSON, no markdown.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: prompt },
        ],
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response from Claude');

    let guide: Record<string, unknown>;
    const raw = content.text.trim();

    // Attempt 1: direct parse
    try {
      guide = JSON.parse(raw);
    } catch {
      // Attempt 2: strip markdown code fences
      try {
        const stripped = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        guide = JSON.parse(stripped);
      } catch {
        // Attempt 3: extract outermost {...} block
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON object found in Claude response');
        let extracted = match[0];
        // Remove trailing commas before } or ] (common Claude mistake)
        extracted = extracted.replace(/,(\s*[}\]])/g, '$1');
        guide = JSON.parse(extracted);
      }
    }

    // Persist guide to project
    await adminClient
      .from('projects')
      .update({ diy_guide: guide, ai_analysis: { category, skill_level, budget_min, budget_max } })
      .eq('id', project_id);

    return new Response(
      JSON.stringify({ success: true, guide }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('generate-diy-guide error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
