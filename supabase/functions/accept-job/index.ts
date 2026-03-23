import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // User-scoped client (respects RLS, verifies JWT)
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Service role client for privileged operations (notifications, cross-table writes)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Verify caller identity
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { project_id } = await req.json();

    // Verify caller is a verified company
    const { data: company, error: companyError } = await adminClient
      .from('companies')
      .select('id, user_id, verified, stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (companyError || !company || !company.verified) {
      return new Response(
        JSON.stringify({ error: 'Only verified companies can accept jobs' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the atomic_accept_job PostgreSQL function
    // This function uses FOR UPDATE NOWAIT to prevent race conditions
    const { data: accepted, error: acceptError } = await adminClient.rpc('atomic_accept_job', {
      p_project_id: project_id,
      p_company_id: company.id,
    });

    if (acceptError) {
      // If error mentions lock_not_available, another accept is in flight
      const isLockError = acceptError.message?.includes('lock');
      return new Response(
        JSON.stringify({
          error: isLockError ? 'Job is currently being claimed — please try again.' : acceptError.message,
          code: 'RACE_CONDITION',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!accepted) {
      return new Response(
        JSON.stringify({ error: 'Job is no longer available', code: 'JOB_FILLED' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Job accepted successfully — send notifications
    // Load project for homeowner details
    const { data: project } = await adminClient
      .from('projects')
      .select('homeowner_id, address, city, room_type')
      .eq('id', project_id)
      .single();

    if (project) {
      // Notify homeowner
      await adminClient.from('notifications').insert({
        user_id: project.homeowner_id,
        type: 'job_accepted',
        payload: {
          project_id,
          company_id: company.id,
          message: 'A contractor has accepted your project!',
          deep_link: `/(homeowner)/project/${project_id}`,
        },
      });

      // Load other dispatched companies to notify them job is filled
      const { data: otherDispatches } = await adminClient
        .from('dispatch_logs')
        .select('companies(user_id)')
        .eq('project_id', project_id)
        .eq('response', 'filled');

      const filledNotifications = (otherDispatches ?? [])
        .map((d: { companies: { user_id: string } | { user_id: string }[] }) => {
          const companyData = Array.isArray(d.companies) ? d.companies[0] : d.companies;
          return companyData?.user_id;
        })
        .filter((uid: string | undefined): uid is string => Boolean(uid))
        .map((uid: string) => ({
          user_id: uid,
          type: 'job_filled',
          payload: {
            project_id,
            message: 'Another contractor accepted this job.',
            deep_link: '/(company)',
          },
        }));

      if (filledNotifications.length > 0) {
        await adminClient.from('notifications').insert(filledNotifications);
      }
    }

    return new Response(
      JSON.stringify({ success: true, project_id, company_id: company.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('accept-job error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
