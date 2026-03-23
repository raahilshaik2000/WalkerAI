import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * expand-dispatch — called by pg_cron every 2 hours.
 * Finds projects that are still 'dispatching' with expired dispatch windows
 * and either expands to the next radius round or gives up.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Find all dispatching projects whose window has expired
    const { data: expiredProjects, error } = await supabase
      .from('projects')
      .select('id, dispatch_round, dispatch_expires_at')
      .eq('status', 'dispatching')
      .lt('dispatch_expires_at', new Date().toISOString());

    if (error) throw error;
    if (!expiredProjects || expiredProjects.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];

    for (const project of expiredProjects) {
      // Mark all pending dispatches as 'timeout'
      await supabase
        .from('dispatch_logs')
        .update({ response: 'timeout' })
        .eq('project_id', project.id)
        .eq('response', 'pending');

      const nextRound = (project.dispatch_round ?? 1) + 1;

      // Re-invoke dispatch-job with the next round
      const { data: dispatchResult, error: dispatchError } = await supabase.functions.invoke(
        'dispatch-job',
        { body: { project_id: project.id, round: nextRound } }
      );

      results.push({
        project_id: project.id,
        next_round: nextRound,
        result: dispatchError ? `error: ${dispatchError.message}` : dispatchResult,
      });
    }

    return new Response(
      JSON.stringify({ processed: expiredProjects.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('expand-dispatch error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
