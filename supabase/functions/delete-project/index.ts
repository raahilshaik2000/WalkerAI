import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    { global: { headers: { Authorization: authHeader } } },
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

    const body = await req.json();
    const { project_id } = body as { project_id?: string };

    if (!project_id || typeof project_id !== 'string') {
      return jsonResponse({ error: 'project_id is required' }, 400);
    }

    // Verify project exists and caller owns it
    const { data: project, error: projectError } = await adminClient
      .from('projects')
      .select('id, homeowner_id')
      .eq('id', project_id)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project) return jsonResponse({ error: 'Project not found' }, 404);
    if (project.homeowner_id !== user.id) {
      return jsonResponse({ error: 'You can only delete your own project' }, 403);
    }

    // 1. Delete reviews (no CASCADE from projects → reviews)
    const { error: reviewsError } = await adminClient
      .from('reviews')
      .delete()
      .eq('project_id', project_id);
    if (reviewsError) {
      console.error('Error deleting reviews:', reviewsError);
      // Non-fatal: continue — reviews delete failure is unlikely to block the project row
    }

    // 2. Delete the project row (cascades all child tables)
    const { error: deleteError } = await adminClient
      .from('projects')
      .delete()
      .eq('id', project_id);
    if (deleteError) throw deleteError;

    // 3. Storage cleanup — best-effort; never 500 if this fails
    try {
      // List and remove objects at the root of this project's folder
      const { data: rootObjects } = await adminClient.storage
        .from('project-photos')
        .list(project_id);

      const rootPaths = (rootObjects ?? [])
        .filter((obj) => obj.name)
        .map((obj) => `${project_id}/${obj.name}`);

      if (rootPaths.length > 0) {
        await adminClient.storage.from('project-photos').remove(rootPaths);
      }

      // Also attempt the slots subfolder
      const { data: slotObjects } = await adminClient.storage
        .from('project-photos')
        .list(`${project_id}/slots`);

      const slotPaths = (slotObjects ?? [])
        .filter((obj) => obj.name)
        .map((obj) => `${project_id}/slots/${obj.name}`);

      if (slotPaths.length > 0) {
        await adminClient.storage.from('project-photos').remove(slotPaths);
      }
    } catch (storageErr) {
      console.error('Storage cleanup failed (non-fatal):', storageErr);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error('delete-project error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
});
