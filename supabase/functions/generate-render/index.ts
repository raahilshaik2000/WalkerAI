import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StyleParams {
  design_style: string;
  material_tier: string;
  room_type: string;
}

function answerValue(answers: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  for (const key of keys) {
    const value = answers?.[key];
    if (typeof value === 'string' && value.trim()) return value.toLowerCase();
  }
  return '';
}

function extractDesignStyle(answers: Record<string, unknown> | null | undefined): string {
  const styleAnswer = answerValue(answers, 'k_style', 'b_style', 'style');
  if (styleAnswer.includes('traditional')) return 'traditional';
  if (styleAnswer.includes('transitional')) return 'transitional';
  if (styleAnswer.includes('farmhouse')) return 'farmhouse';
  if (styleAnswer.includes('industrial')) return 'industrial';
  if (styleAnswer.includes('contemporary')) return 'contemporary';
  if (styleAnswer.includes('modern')) return 'modern';
  return 'modern';
}

function extractMaterialTier(answers: Record<string, unknown> | null | undefined): string {
  const tierAnswer = answerValue(answers, 'k_tier', 'b_tier', 'quality_tier');
  if (tierAnswer.includes('luxury')) return 'luxury';
  if (tierAnswer.includes('mid')) return 'mid-range';
  return 'budget';
}

async function callReimagineHome(
  photoUrl: string,
  params: StyleParams,
  apiKey: string
): Promise<string | null> {
  // Initial render request
  const initRes = await fetch('https://api.reimaginehome.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: photoUrl,
      room_type: params.room_type,
      design_style: params.design_style,
      material_tier: params.material_tier,
    }),
  });

  if (!initRes.ok) throw new Error(`REimagineHome init failed: ${initRes.status}`);
  const { job_id } = await initRes.json();

  // Poll for completion (max 60 seconds)
  const maxAttempts = 12;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`https://api.reimaginehome.ai/v1/jobs/${job_id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) continue;
    const job = await pollRes.json();
    if (job.status === 'completed') return job.output_url as string;
    if (job.status === 'failed') throw new Error('REimagineHome render failed');
  }
  throw new Error('REimagineHome timed out');
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

    const { project_id, questionnaire_answers } = await req.json();
    if (!project_id || typeof project_id !== 'string') {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load project + photos
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, room_type, homeowner_id')
      .eq('id', project_id)
      .single();

    if (projectError || !project || project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: existingRenders, error: existingRendersError } = await adminClient
      .from('renders')
      .select('id, url, style_params, selected')
      .eq('project_id', project_id)
      .order('created_at', { ascending: true });
    if (existingRendersError) throw existingRendersError;

    if (existingRenders && existingRenders.length > 0) {
      return new Response(
        JSON.stringify({ success: true, renders: existingRenders, fallback: false, cached: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: photos, error: photosError } = await adminClient
      .from('project_photos')
      .select('url')
      .eq('project_id', project_id)
      .limit(1);
    if (photosError) throw photosError;

    if (!photos || photos.length === 0) {
      return new Response(JSON.stringify({ error: 'No photos found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const primaryPhotoUrl = photos[0].url;
    const apiKey = Deno.env.get('REIMAGINE_API_KEY');

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          renders: [],
          fallback: true,
          reason: 'No image-based render provider is configured',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Derive style from the fixed questionnaire answer IDs used by the app.
    const selectedStyle = extractDesignStyle(questionnaire_answers);
    const selectedTier = extractMaterialTier(questionnaire_answers);
    const qualityTierMap: Record<string, string> = {
      budget: 'budget', 'mid-range': 'standard', luxury: 'luxury',
    };

    // Generate up to 3 renders (different styles)
    const renderConfigs: StyleParams[] = [
      {
        design_style: selectedStyle,
        material_tier: qualityTierMap[selectedTier] ?? 'standard',
        room_type: project.room_type,
      },
      {
        design_style: 'contemporary',
        material_tier: 'standard',
        room_type: project.room_type,
      },
    ];

    const savedRenders: Array<{ id: string; url: string; style_params: StyleParams }> = [];

    // Image-based render path only. Avoid text-only generated room renders; they
    // can misrepresent the homeowner's actual space and should not drive scope.
    for (const config of renderConfigs) {
      let renderUrl: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          renderUrl = await callReimagineHome(primaryPhotoUrl, config, apiKey);
          break;
        } catch (e) {
          console.warn(`REimagineHome attempt ${attempt + 1} failed:`, e);
        }
      }
      if (!renderUrl) continue;

      const { data: saved, error: saveError } = await adminClient
        .from('renders')
        .insert({ project_id, url: renderUrl, style_params: config, selected: false })
        .select('id, url, style_params')
        .single();
      if (saveError) {
        console.warn(`Failed to save REimagineHome render: ${saveError.message}`);
        continue;
      }
      if (saved) savedRenders.push(saved);
    }

    return new Response(
      JSON.stringify({
        success: true,
        renders: savedRenders,
        fallback: savedRenders.length === 0,
        reason: savedRenders.length === 0 ? 'Image-based render provider did not return a preview' : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('generate-render error:', err);
    // Graceful fallback — return empty renders rather than 500
    return new Response(
      JSON.stringify({ success: true, renders: [], fallback: true, error: String(err) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
