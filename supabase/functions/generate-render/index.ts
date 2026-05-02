import { createClient } from 'jsr:@supabase/supabase-js@2';
import OpenAI from 'npm:openai@4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StyleParams {
  design_style: string;
  material_tier: string;
  room_type: string;
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

    const { project_id, analysis, questionnaire_answers } = await req.json();

    // Load project + photos
    const { data: project } = await adminClient
      .from('projects')
      .select('id, room_type, homeowner_id')
      .eq('id', project_id)
      .single();

    if (!project || project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: photos } = await adminClient
      .from('project_photos')
      .select('url')
      .eq('project_id', project_id)
      .limit(1);

    if (!photos || photos.length === 0) {
      return new Response(JSON.stringify({ error: 'No photos found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const primaryPhotoUrl = photos[0].url;
    const apiKey = Deno.env.get('REIMAGINE_API_KEY');

    // Derive style from questionnaire answers
    const styleMap: Record<string, string> = {
      modern: 'modern', traditional: 'traditional',
      transitional: 'transitional', contemporary: 'contemporary',
    };
    const qualityTierMap: Record<string, string> = {
      budget: 'budget', 'mid-range': 'standard', luxury: 'luxury',
    };

    const designStyles = ['modern', 'traditional', 'transitional', 'contemporary'];
    const qualityTiers = ['budget', 'mid-range', 'luxury'];

    // Generate up to 3 renders (different styles)
    const renderConfigs: StyleParams[] = [
      {
        design_style: styleMap[questionnaire_answers?.style ?? 'modern'] ?? 'modern',
        material_tier: qualityTierMap[questionnaire_answers?.quality_tier ?? 'mid-range'] ?? 'standard',
        room_type: project.room_type,
      },
      {
        design_style: 'contemporary',
        material_tier: 'standard',
        room_type: project.room_type,
      },
    ];

    const savedRenders: Array<{ id: string; url: string; style_params: StyleParams }> = [];

    if (apiKey) {
      // REimagineHome path — best quality for room renders
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

        const { data: saved } = await adminClient
          .from('renders')
          .insert({ project_id, url: renderUrl, style_params: config, selected: false })
          .select('id, url, style_params')
          .single();
        if (saved) savedRenders.push(saved);
      }
    } else {
      // DALL-E 3 fallback — uses existing OpenAI key
      const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });
      const style = questionnaire_answers?.style ?? 'modern';
      const qualityTier = questionnaire_answers?.quality_tier ?? 'mid-range';
      const detectedMaterials = analysis?.detected_materials
        ? Object.values(analysis.detected_materials).join(', ')
        : 'standard finishes';

      const dalleConfigs = [
        { style, qualityTier, label: 'primary' },
        { style: 'contemporary', qualityTier, label: 'contemporary' },
      ];

      for (const cfg of dalleConfigs) {
        try {
          const prompt = `A photorealistic ${cfg.style} ${project.room_type} renovation render. ` +
            `Quality tier: ${cfg.qualityTier}. ` +
            `Existing detected materials: ${detectedMaterials}. ` +
            `Clean, professional interior design photo, bright lighting, sharp details. ` +
            `Do not include people. 16:9 wide angle shot showing the full room.`;

          const imgResponse = await openai.images.generate({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size: '1792x1024',
            quality: 'standard',
          });

          const imageUrl = imgResponse.data[0]?.url;
          if (!imageUrl) continue;

          // Download and upload to Supabase storage so URL is permanent
          const imgBuffer = await fetch(imageUrl).then((r) => r.arrayBuffer());
          const storagePath = `${project_id}/render_${cfg.label}_${Date.now()}.png`;

          await adminClient.storage
            .from('renders')
            .upload(storagePath, imgBuffer, { contentType: 'image/png', upsert: true });

          const { data: publicUrlData } = adminClient.storage
            .from('renders')
            .getPublicUrl(storagePath);

          const publicUrl = publicUrlData?.publicUrl;
          if (!publicUrl) continue;

          const styleParams: StyleParams = {
            design_style: cfg.style,
            material_tier: cfg.qualityTier,
            room_type: project.room_type,
          };

          const { data: saved } = await adminClient
            .from('renders')
            .insert({ project_id, url: publicUrl, style_params: styleParams, selected: false })
            .select('id, url, style_params')
            .single();

          if (saved) savedRenders.push(saved);
        } catch (e) {
          console.warn(`DALL-E render failed for ${cfg.label}:`, e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        renders: savedRenders,
        fallback: savedRenders.length === 0,
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
