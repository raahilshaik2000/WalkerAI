import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39';

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

  try {
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id, analysis } = await req.json();

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load project room_type
    const { data: project } = await adminClient
      .from('projects')
      .select('room_type, homeowner_id')
      .eq('id', project_id)
      .single();

    if (!project || project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Based on this ${project.room_type} analysis: ${JSON.stringify(analysis)}

Generate a personalized renovation questionnaire. Return a valid JSON object with this exact structure:
{
  "questions": [
    {
      "id": "q1",
      "text": "Question text here",
      "type": "single_select",
      "options": [
        { "id": "q1_a", "label": "Option label", "next_question_id": "q2" },
        { "id": "q1_b", "label": "Option label", "next_question_id": null }
      ],
      "context_note": "Why we're asking this"
    }
  ]
}

Requirements:
- Maximum 8 questions total
- Cover: design style (modern/traditional/transitional/contemporary), material quality tier (budget/mid-range/luxury), timeline urgency, specific pain points, staying home during renovation
- Use branching (next_question_id) to skip irrelevant follow-ups. Set next_question_id to null for terminal branches
- Make questions feel personalized to what you observed in the photos
- All question IDs must be unique strings like "q1", "q2", etc.
- All option IDs must be unique strings like "q1_a", "q1_b", etc.

Return ONLY the JSON object, no markdown.`,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response');

    let questionnaire: { questions: unknown[] };
    try {
      questionnaire = JSON.parse(content.text.trim());
    } catch {
      const stripped = content.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      questionnaire = JSON.parse(stripped);
    }

    return new Response(
      JSON.stringify({ success: true, questions: questionnaire.questions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('generate-questionnaire error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
