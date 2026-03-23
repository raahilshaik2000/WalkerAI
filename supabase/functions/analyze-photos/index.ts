import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.30';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { project_id, photo_urls } = await req.json();

    if (!photo_urls || photo_urls.length < 1) {
      return new Response(JSON.stringify({ error: 'At least one photo URL required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load project to get room_type
    const { data: project } = await adminClient
      .from('projects')
      .select('room_type, homeowner_id')
      .eq('id', project_id)
      .single();

    if (!project || project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Project not found or unauthorized' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    // Build image content blocks (use up to 8 photos to stay within token limits)
    const imageBlocks = photo_urls.slice(0, 8).map((url: string) => ({
      type: 'image' as const,
      source: { type: 'url' as const, url },
    }));

    const roomType = project.room_type ?? 'kitchen';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          {
            type: 'text',
            text: `Analyze these ${roomType} renovation photos and return a valid JSON object with this exact structure:
{
  "room_type": "${roomType}",
  "existing_materials": {
    "cabinets": { "type": "string", "condition": "poor|fair|good", "estimated_age_years": number },
    "countertops": { "material": "string", "condition": "string" },
    "flooring": { "material": "string", "condition": "string" },
    "fixtures": ["string"],
    "appliances": ["string"]
  },
  "layout": {
    "estimated_sqft": number,
    "has_island": boolean,
    "plumbing_wall_visible": boolean,
    "window_count": number
  },
  "structural_concerns": ["string"],
  "ai_observations": "2-3 sentence summary for the homeowner"
}

Return ONLY the JSON object, no markdown, no explanation.`,
          },
        ],
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

    let analysis: Record<string, unknown>;
    try {
      analysis = JSON.parse(content.text.trim());
    } catch {
      // Claude sometimes wraps in markdown — strip it
      const stripped = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(stripped);
    }

    // Persist to projects.ai_analysis
    await adminClient
      .from('projects')
      .update({ ai_analysis: analysis })
      .eq('id', project_id);

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('analyze-photos error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
