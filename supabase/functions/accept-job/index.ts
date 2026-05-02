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

    const body = await req.json();
    const { project_id, slot_id } = body as { project_id?: string; slot_id?: string };

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

    // ── Slot-based acceptance (new trade-slot flow) ──────────────
    if (slot_id) {
      const { data: accepted, error: acceptError } = await adminClient.rpc('atomic_accept_slot', {
        p_slot_id: slot_id,
        p_company_id: company.id,
      });

      if (acceptError) {
        const isLockError = acceptError.message?.includes('lock');
        return new Response(
          JSON.stringify({
            error: isLockError ? 'Slot is currently being claimed — please try again.' : acceptError.message,
            code: 'RACE_CONDITION',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!accepted) {
        return new Response(
          JSON.stringify({ error: 'Slot is no longer available', code: 'SLOT_FILLED' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Load slot + project details
      const { data: slot } = await adminClient
        .from('project_slots')
        .select('id, trade_type, project_id, projects(homeowner_id, status, scheduling_status, ai_cost_min, ai_cost_max)')
        .eq('id', slot_id)
        .single();

      const proj = slot?.projects as { homeowner_id: string; status: string; scheduling_status: string; ai_cost_min: number; ai_cost_max: number } | undefined;

      if (proj) {
        // Notify homeowner about this slot being filled
        await adminClient.from('notifications').insert({
          user_id: proj.homeowner_id,
          type: 'slot_accepted',
          payload: {
            slot_id,
            project_id: slot?.project_id,
            trade_type: slot?.trade_type,
            company_id: company.id,
            message: `A ${slot?.trade_type?.replace(/_/g, ' ')} contractor has joined your project.`,
            deep_link: `/(homeowner)/project/${slot?.project_id}`,
          },
        });

        // If ALL slots are now filled (project moved to 'scheduling'), notify homeowner to schedule
        if (proj.status === 'scheduling' && proj.scheduling_status === 'pending_homeowner') {
          await adminClient.from('notifications').insert({
            user_id: proj.homeowner_id,
            type: 'all_slots_filled',
            payload: {
              project_id: slot?.project_id,
              message: 'All trades have been assigned! Review the schedule and confirm start dates.',
              deep_link: `/(homeowner)/project/${slot?.project_id}/schedule`,
            },
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, slot_id, company_id: company.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Legacy single-contractor acceptance ──────────────────────
    if (!project_id) {
      return new Response(
        JSON.stringify({ error: 'project_id or slot_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call the atomic_accept_job PostgreSQL function
    const { data: accepted, error: acceptError } = await adminClient.rpc('atomic_accept_job', {
      p_project_id: project_id,
      p_company_id: company.id,
    });

    if (acceptError) {
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

    // Job accepted successfully — load project details
    const { data: project } = await adminClient
      .from('projects')
      .select('homeowner_id, address, city, room_type, ai_cost_min, ai_cost_max')
      .eq('id', project_id)
      .single();

    // Auto-create a quote at the AI price with standard milestones + line items
    if (project?.ai_cost_min && project?.ai_cost_max) {
      const avgCost = Math.round((project.ai_cost_min + project.ai_cost_max) / 2);
      const deposit    = Math.round(avgCost * 0.30);
      const midpoint   = Math.round(avgCost * 0.30);
      const completion = avgCost - deposit - midpoint;

      const { data: quote } = await adminClient
        .from('quotes')
        .insert({
          project_id,
          company_id: company.id,
          total_amount: avgCost,
          status: 'pending',
          commission_rate: 0.10,
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (quote?.id) {
        await adminClient.from('milestones').insert([
          { quote_id: quote.id, title: 'Project Deposit',    amount: deposit,    sort_order: 1, status: 'pending' },
          { quote_id: quote.id, title: 'Mid-Project',        amount: midpoint,   sort_order: 2, status: 'pending' },
          { quote_id: quote.id, title: 'Final Completion',   amount: completion, sort_order: 3, status: 'pending' },
        ]);

        // Populate quote line items from scope (labour) and materials
        const [{ data: scope }, { data: mats }] = await Promise.all([
          adminClient.from('scope_of_work').select('phase, description').eq('project_id', project_id).order('sort_order'),
          adminClient.from('materials').select('item, quantity, unit, quality_tier').eq('project_id', project_id),
        ]);

        const lineItems = [
          ...(scope ?? []).map((s: { phase: string; description: string }, i: number) => ({
            quote_id: quote.id,
            type: 'labour',
            description: `[${s.phase}] ${s.description}`,
            quantity: 1,
            sort_order: i + 1,
          })),
          ...(mats ?? []).map((m: { item: string; quantity: number; unit: string | null; quality_tier: string | null }, i: number) => ({
            quote_id: quote.id,
            type: 'material',
            description: m.item,
            quantity: m.quantity ?? 1,
            unit: m.unit,
            sort_order: (scope?.length ?? 0) + i + 1,
          })),
        ];

        if (lineItems.length > 0) {
          await adminClient.from('quote_line_items').insert(lineItems);
        }
      }
    }

    if (project) {
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
