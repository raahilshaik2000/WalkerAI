import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
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

    const { project_id, photo_urls, photo_base64s } = await req.json();

    const hasUrls = Array.isArray(photo_urls) && photo_urls.length > 0;
    const hasBase64s = Array.isArray(photo_base64s) && photo_base64s.length > 0;

    if (!hasUrls && !hasBase64s) {
      return new Response(JSON.stringify({ error: 'At least one photo is required' }), {
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

    const imageBlocks: Anthropic.ImageBlockParam[] = [];

    if (hasBase64s) {
      // Base64 sent directly from the client — no fetching needed
      for (const b64 of (photo_base64s as string[]).slice(0, 8)) {
        imageBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
        });
      }
    } else {
      // Fetch each signed URL and convert to base64
      for (const url of (photo_urls as string[]).slice(0, 8)) {
        try {
          const base64Data = await urlToBase64(url);
          imageBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64Data },
          });
        } catch (fetchErr) {
          console.error('Failed to fetch image, skipping:', fetchErr);
        }
      }
    }

    if (imageBlocks.length === 0) {
      throw new Error('Failed to load any photos for analysis.');
    }

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
