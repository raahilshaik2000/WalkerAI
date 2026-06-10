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

type VisionMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
type PhotoBase64Payload = string | {
  data?: unknown;
  base64?: unknown;
  media_type?: unknown;
  content_type?: unknown;
};

function cleanBase64(data: string): string {
  return data.replace(/^data:[^;]+;base64,/, '');
}

function visionMediaTypeFor(value: unknown): VisionMediaType {
  if (typeof value !== 'string') return 'image/jpeg';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'image/jpg') return 'image/jpeg';
  if (
    normalized === 'image/jpeg' ||
    normalized === 'image/png' ||
    normalized === 'image/webp' ||
    normalized === 'image/gif'
  ) {
    return normalized;
  }
  return 'image/jpeg';
}

function normalizePhotoPayload(payload: PhotoBase64Payload): { data: string; mediaType: VisionMediaType } | null {
  if (typeof payload === 'string') {
    return { data: cleanBase64(payload), mediaType: visionMediaTypeFor(null) };
  }

  const rawData = typeof payload.data === 'string'
    ? payload.data
    : typeof payload.base64 === 'string'
      ? payload.base64
      : null;

  if (!rawData) return null;

  return {
    data: cleanBase64(rawData),
    mediaType: visionMediaTypeFor(payload.media_type ?? payload.content_type),
  };
}

function fallbackAnalysis(roomType: string, reason: string): Record<string, unknown> {
  const isBathroom = roomType === 'bathroom';
  return {
    room_type: roomType,
    existing_materials: isBathroom
      ? {
        cabinets: { type: 'unknown vanity/cabinetry', condition: 'fair', estimated_age_years: 0 },
        countertops: { material: 'unknown vanity top', condition: 'unknown' },
        flooring: { material: 'unknown bathroom flooring', condition: 'unknown' },
        fixtures: ['bathroom fixtures to verify on site'],
        appliances: [],
      }
      : {
        cabinets: { type: 'unknown kitchen cabinetry', condition: 'fair', estimated_age_years: 0 },
        countertops: { material: 'unknown countertop material', condition: 'unknown' },
        flooring: { material: 'unknown kitchen flooring', condition: 'unknown' },
        fixtures: ['kitchen fixtures to verify on site'],
        appliances: ['appliances to verify on site'],
      },
    layout: {
      estimated_sqft: 0,
      has_island: false,
      plumbing_wall_visible: false,
      window_count: 0,
    },
    structural_concerns: [],
    ai_observations: `Photos were uploaded, but automated visual analysis was unavailable (${reason}). The project can continue using homeowner answers, measurements, and contractor verification.`,
    analysis_fallback: true,
  };
}

function parseProviderJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text.trim());
  } catch {
    const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(stripped);
  }
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

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const roomType = project.room_type ?? 'kitchen';

    if (!anthropicApiKey) {
      const analysis = fallbackAnalysis(roomType, 'missing Anthropic API key');
      await adminClient
        .from('projects')
        .update({ ai_analysis: analysis })
        .eq('id', project_id);

      return new Response(
        JSON.stringify({ success: true, analysis, fallback: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const imageBlocks: Anthropic.ImageBlockParam[] = [];

    if (hasBase64s) {
      // Base64 sent directly from the client — no fetching needed
      for (const payload of (photo_base64s as PhotoBase64Payload[]).slice(0, 8)) {
        const normalized = normalizePhotoPayload(payload);
        if (!normalized) continue;
        imageBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: normalized.mediaType, data: normalized.data },
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

    let analysis: Record<string, unknown>;
    try {
      const response = await anthropic.messages.create({
        model: Deno.env.get('ANTHROPIC_VISION_MODEL') ?? 'claude-3-5-sonnet-20241022',
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
      analysis = parseProviderJson(content.text);
    } catch (analysisError) {
      console.error('Anthropic analysis failed, using fallback:', analysisError);
      analysis = fallbackAnalysis(roomType, analysisError instanceof Error ? analysisError.message : 'provider error');
    }

    // Persist to projects.ai_analysis. The client also writes the analysis
    // into the projects + wizard store on its end, so this server-side
    // write is a redundancy. If the database connection times out (common
    // under load), don't fail the whole call — just log and return the
    // analysis so the homeowner can continue.
    try {
      const dbWritePromise = adminClient
        .from('projects')
        .update({ ai_analysis: analysis })
        .eq('id', project_id);

      // Cap the DB write at 10s. If it doesn't finish in that window,
      // the analysis still comes back successfully and the client persists
      // it directly.
      await Promise.race([
        dbWritePromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
    } catch (persistError) {
      console.warn(
        'ai_analysis persist failed (non-fatal — client will retry):',
        persistError instanceof Error ? persistError.message : persistError,
      );
    }

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
