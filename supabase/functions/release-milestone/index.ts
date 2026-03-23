import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

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

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

  try {
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { milestone_id } = await req.json();

    // Load milestone with full context
    const { data: milestone, error: msError } = await adminClient
      .from('milestones')
      .select(`
        id, title, amount, status, sort_order, stripe_transfer_id,
        quote:quotes (
          id, total_amount, commission_rate, stripe_payment_intent_id,
          project:projects (
            id, homeowner_id, assigned_company_id, province,
            company:companies (
              id, user_id, stripe_account_id, province
            )
          )
        )
      `)
      .eq('id', milestone_id)
      .single();

    if (msError || !milestone) {
      return new Response(JSON.stringify({ error: 'Milestone not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quote = milestone.quote as {
      id: string;
      total_amount: number;
      commission_rate: number;
      stripe_payment_intent_id: string;
      project: {
        id: string;
        homeowner_id: string;
        assigned_company_id: string;
        province: string;
        company: {
          id: string;
          user_id: string;
          stripe_account_id: string;
          province: string;
        };
      };
    };

    const project = quote.project;
    const company = project.company;

    // Authorization: only the homeowner can release milestones
    if (project.homeowner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate milestone is ready for release
    if (milestone.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Milestone must be marked complete by contractor before approval' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (milestone.stripe_transfer_id) {
      return new Response(
        JSON.stringify({ error: 'Milestone payment already released' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check no active dispute on the project
    const { data: dispute } = await adminClient
      .from('disputes')
      .select('id')
      .eq('project_id', project.id)
      .in('status', ['open', 'under_review'])
      .single();

    if (dispute) {
      return new Response(
        JSON.stringify({ error: 'Cannot release payment while a dispute is active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine if this is the final milestone
    const { data: allMilestones } = await adminClient
      .from('milestones')
      .select('id, status')
      .eq('quote_id', quote.id);

    const remainingMilestones = (allMilestones ?? []).filter(
      (m: { id: string; status: string }) => m.id !== milestone_id && m.status !== 'paid' && m.status !== 'homeowner_approved'
    );
    const isFinalMilestone = remainingMilestones.length === 0;

    // Calculate transfer amount
    const commissionRate = quote.commission_rate ?? 0.10;
    let transferAmount: number;

    if (isFinalMilestone) {
      // On final milestone: deduct entire commission from the total remaining
      const totalPaid = (allMilestones ?? [])
        .filter((m: { id: string; status: string }) => m.status === 'paid' || m.status === 'homeowner_approved')
        .reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);

      const totalCommission = Math.round(quote.total_amount * commissionRate);
      const commissionAlreadyDeducted = Math.round(totalPaid * commissionRate);
      const remainingCommission = totalCommission - commissionAlreadyDeducted;
      transferAmount = milestone.amount - remainingCommission;
    } else {
      // For intermediate milestones, pro-rate the commission
      transferAmount = Math.round(milestone.amount * (1 - commissionRate));
    }

    if (!company.stripe_account_id) {
      return new Response(
        JSON.stringify({ error: 'Contractor has not completed Stripe onboarding' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Stripe transfer to company's Connect account
    // Funds move from WalkerAI platform balance to company
    const transfer = await stripe.transfers.create({
      amount: transferAmount, // CAD cents
      currency: 'cad',
      destination: company.stripe_account_id,
      metadata: {
        project_id: project.id,
        milestone_id,
        quote_id: quote.id,
        commission_rate: commissionRate.toString(),
        is_final_milestone: isFinalMilestone.toString(),
      },
      description: `WalkerAI Milestone Release — ${milestone.title}`,
    });

    // Update milestone status
    await adminClient
      .from('milestones')
      .update({
        status: 'paid',
        approved_at: new Date().toISOString(),
        approved_by: user.id,
        stripe_transfer_id: transfer.id,
      })
      .eq('id', milestone_id);

    // Notify company
    await adminClient.from('notifications').insert({
      user_id: company.user_id,
      type: 'milestone_paid',
      payload: {
        project_id: project.id,
        milestone_id,
        milestone_title: milestone.title,
        amount: transferAmount,
        is_final: isFinalMilestone,
        deep_link: `/(company)/job/${project.id}/milestones`,
      },
    });

    // If final milestone — trigger project completion + review flow
    if (isFinalMilestone) {
      await adminClient
        .from('projects')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', project.id);

      // Prompt both parties to leave reviews
      await adminClient.from('notifications').insert([
        {
          user_id: project.homeowner_id,
          type: 'project_complete',
          payload: {
            project_id: project.id,
            message: 'Your renovation is complete! Please leave a review.',
            deep_link: `/(homeowner)/project/${project.id}`,
          },
        },
        {
          user_id: company.user_id,
          type: 'project_complete',
          payload: {
            project_id: project.id,
            message: 'Project complete. Leave a review for this homeowner.',
            deep_link: `/(company)/job/${project.id}`,
          },
        },
      ]);
    }

    // Calculate HST on commission (WalkerAI owes this to CRA)
    const commissionAmount = milestone.amount - transferAmount;
    const hstRate = await getHSTRate(adminClient, company.province);
    const hstOwed = Math.round(commissionAmount * hstRate);

    return new Response(
      JSON.stringify({
        success: true,
        transfer_id: transfer.id,
        transfer_amount_cad_cents: transferAmount,
        commission_amount_cad_cents: commissionAmount,
        hst_on_commission_cents: hstOwed,
        is_final_milestone: isFinalMilestone,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('release-milestone error:', err);

    if (err instanceof Stripe.errors.StripeError) {
      return new Response(JSON.stringify({ error: `Stripe error: ${err.message}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getHSTRate(
  adminClient: ReturnType<typeof createClient>,
  province: string
): Promise<number> {
  const { data } = await adminClient.rpc('canadian_tax_rate', { province_code: province });
  return (data as number) ?? 0.05;
}
