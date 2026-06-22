import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function sniffVisionMediaType(bytes: Uint8Array): VisionMediaType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
  ) return 'image/png';
  if (
    bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
  ) return 'image/gif';
  if (
    bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

async function urlToVisionImage(url: string): Promise<{ data: string; mediaType: VisionMediaType } | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mediaType = sniffVisionMediaType(bytes);
  if (!mediaType) return null;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { data: btoa(binary), mediaType };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
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
      return jsonResponse({ error: 'Unauthorized' }, 401);
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

    if (!project_id || typeof project_id !== 'string') {
      return jsonResponse({ error: 'Project ID is required' }, 400);
    }

    const requestedPhotoUrls = Array.isArray(photo_urls)
      ? photo_urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      : [];
    if (requestedPhotoUrls.length === 0) {
      return jsonResponse({ error: 'At least one uploaded project photo is required' }, 400);
    }

    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, homeowner_id')
      .eq('id', project_id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return jsonResponse({ error: 'Project not found' }, 404);
    if (project.homeowner_id !== user.id) {
      return jsonResponse({ error: 'You can only generate a DIY guide for your own project' }, 403);
    }

    const { data: photoRows, error: photoError } = await adminClient
      .from('project_photos')
      .select('url')
      .eq('project_id', project_id)
      .in('url', requestedPhotoUrls);
    if (photoError) throw photoError;

    const projectPhotoUrls = new Set((photoRows ?? []).map((row) => row.url));
    const safePhotoUrls = requestedPhotoUrls.filter((url) => projectPhotoUrls.has(url)).slice(0, 6);
    if (safePhotoUrls.length === 0) {
      return jsonResponse({ error: 'Uploaded project photos were not found for this DIY project' }, 400);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

    // Convert photos to base64
    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    for (const url of safePhotoUrls) {
      try {
        const image = await urlToVisionImage(url);
        if (!image) continue;
        imageBlocks.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
      } catch (e) {
        console.error('Image fetch failed, skipping:', e);
      }
    }
    if (imageBlocks.length === 0) {
      return jsonResponse({ error: 'DIY guide photos must be JPEG, PNG, GIF, or WebP images' }, 400);
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

    let guide: Record<string, unknown>;
    let usedFallback = false;
    try {
      if (!anthropic) throw new Error('ANTHROPIC_API_KEY not configured');
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
    } catch (aiError) {
      // Missing key or provider/parse failure: return a safe generic guide
      // instead of a 500 so the homeowner is never left stuck on this step.
      console.warn('generate-diy-guide falling back to template guide:', aiError);
      guide = fallbackGuide(description, category, skill_level, budgetLabel, isHazardous);
      usedFallback = true;
    }

    const { data: persistedProject, error: persistError } = await adminClient
      .from('projects')
      .update({
        diy_guide: guide,
        diy_category: category,
        ai_analysis: { category, skill_level, budget_min, budget_max },
      })
      .eq('id', project_id)
      .eq('homeowner_id', user.id)
      .select('id')
      .maybeSingle();
    if (persistError) throw new Error(`DIY guide could not be saved: ${persistError.message}`);
    if (!persistedProject) throw new Error('DIY guide could not be saved to this project');

    return jsonResponse({ success: true, guide, fallback: usedFallback });

  } catch (err) {
    console.error('generate-diy-guide error:', err);
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});

// Deterministic safe guide used when the AI provider is unavailable or returns
// unparseable output. Mirrors the JSON shape the app expects so the DIY screen
// always has something to render.
function fallbackGuide(
  description: string,
  category: string,
  skillLevel: string,
  budgetLabel: string,
  isHazardous: boolean,
): Record<string, unknown> {
  const proWarning = isHazardous
    ? `${category} work can be dangerous. If you are not fully confident, hire a licensed professional.`
    : 'Stop and consult a professional if the work exceeds your comfort level.';
  return {
    title: `DIY Guide: ${description}`.slice(0, 60),
    overview: `A general step-by-step approach for this ${category} project at a ${skillLevel} skill level. Detailed AI guidance was unavailable, so this is a safe, generic starting plan — review each step against your actual space before starting.`,
    estimated_time: 'Varies',
    difficulty: skillLevel === 'advanced' ? 'Advanced' : skillLevel === 'intermediate' ? 'Intermediate' : 'Beginner',
    recommend_pro: isHazardous,
    safety_warnings: [
      'Turn off and isolate any relevant power, water, or gas before starting.',
      'Wear appropriate protective equipment (gloves, eye protection, dust mask).',
      proWarning,
    ],
    steps: [
      { step_number: 1, title: 'Plan and prep the area', description: 'Clear the workspace, protect surrounding surfaces, and gather everything you need before you begin.', tip: 'Take before photos for reference.', warning: isHazardous ? 'Shut off the relevant utility (power/water/gas) first.' : null },
      { step_number: 2, title: 'Gather tools and materials', description: `Source the tools and materials needed for this ${category} task within your ${budgetLabel} budget.`, tip: 'Buy a little extra material to account for mistakes.', warning: null },
      { step_number: 3, title: 'Work in small, reversible stages', description: 'Proceed methodically in small steps, checking your progress and fit as you go.', tip: 'Measure twice, cut once.', warning: null },
      { step_number: 4, title: 'Inspect and finish', description: 'Test your work, clean up, and confirm everything functions and looks correct before considering it done.', tip: null, warning: 'If anything feels unsafe or wrong, stop and call a professional.' },
    ],
    materials: [
      { name: 'Project-specific materials', quantity: 'As needed', estimated_cost: budgetLabel, where_to_buy: 'Home Depot / local hardware store', is_tool: false },
      { name: 'Basic hand tools', quantity: '1 set', estimated_cost: 'Varies', where_to_buy: 'Hardware store', is_tool: true },
      { name: 'Safety equipment (gloves, eye protection)', quantity: '1 set', estimated_cost: '$15–30', where_to_buy: 'Hardware store', is_tool: true },
    ],
    when_to_call_pro: isHazardous
      ? `Hire a licensed ${category} professional if the job involves permits, structural changes, or you are unsure at any point.`
      : 'Hire a professional if the project involves structural, electrical, or plumbing changes beyond basic work, or if you are unsure at any point.',
    total_estimated_cost: budgetLabel,
  };
}
