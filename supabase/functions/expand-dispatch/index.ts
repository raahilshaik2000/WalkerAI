import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_DISPATCH_ROUNDS = 4;
const DISPATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * expand-dispatch — called by pg_cron every 2 hours.
 * Finds projects that are still 'dispatching' with expired dispatch windows
 * and either expands to the next radius round or gives up.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Cron-only function: it drives the dispatch state machine with the service
  // role (bypassing RLS), so it must not be reachable by anonymous/anon-key
  // callers. Require the caller to present the service role key as a bearer
  // token. The pg_cron job that invokes this must send
  // `Authorization: Bearer <service_role_key>`.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
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
      // Mark all pending dispatches as timed out for this project. The slot
      // itself remains dispatching so dispatch-slots can widen the radius and
      // invite companies that have not already seen that specific slot.
      const { error: timeoutError } = await supabase
        .from('dispatch_logs')
        .update({ response: 'timeout', responded_at: new Date().toISOString() })
        .eq('project_id', project.id)
        .eq('response', 'pending');
      if (timeoutError) throw timeoutError;

      const nextRound = (project.dispatch_round ?? 1) + 1;

      if (nextRound > MAX_DISPATCH_ROUNDS) {
        const { data: projectOwner, error: ownerError } = await supabase
          .from('projects')
          .select('homeowner_id')
          .eq('id', project.id)
          .single();
        if (ownerError) throw ownerError;

        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: projectOwner.homeowner_id,
          type: 'dispatch_no_match',
          payload: {
            project_id: project.id,
            message: 'We could not find an available contractor after widening the search. Your project brief is still saved and ready to send again.',
            deep_link: `/(homeowner)/project/${project.id}`,
          },
        });
        if (notificationError) console.warn('dispatch_no_match notification failed:', notificationError.message);

        const { error: projectUpdateError } = await supabase
          .from('projects')
          .update({
            status: 'brief_ready',
            dispatch_round: MAX_DISPATCH_ROUNDS,
            dispatch_expires_at: null,
          })
          .eq('id', project.id);
        if (projectUpdateError) throw projectUpdateError;

        results.push({
          project_id: project.id,
          next_round: nextRound,
          result: { dispatched: 0, max_rounds_reached: true },
        });
        continue;
      }

      // Re-invoke the current trade-slot dispatcher with the next radius round.
      const { data: dispatchResult, error: dispatchError } = await supabase.functions.invoke(
        'dispatch-slots',
        { body: { project_id: project.id, round: nextRound } }
      );

      if (!dispatchError && (!dispatchResult?.success || !dispatchResult?.dispatched)) {
        const nextExpiresAt = new Date(Date.now() + DISPATCH_WINDOW_MS).toISOString();
        const { error: projectUpdateError } = await supabase
          .from('projects')
          .update({
            dispatch_round: nextRound,
            dispatch_expires_at: nextExpiresAt,
          })
          .eq('id', project.id);
        if (projectUpdateError) throw projectUpdateError;
      }

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
