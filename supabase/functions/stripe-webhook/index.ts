import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

// No CORS headers — Stripe webhook hits this directly, not from browser
Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const sig = req.headers.get('stripe-signature');
    if (!sig) return new Response('Missing signature', { status: 400 });

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);

    // Idempotency — skip if already processed
    const { data: existing } = await adminClient
      .from('processed_stripe_events')
      .select('id')
      .eq('event_id', event.id)
      .single();

    if (existing) return new Response(JSON.stringify({ received: true, skipped: true }));

    await adminClient.from('processed_stripe_events').insert({ event_id: event.id });

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { project_id, quote_id } = pi.metadata;
        if (project_id && quote_id) {
          await adminClient
            .from('quotes')
            .update({ status: 'approved', approved_at: new Date().toISOString() })
            .eq('stripe_payment_intent_id', pi.id);
          await adminClient
            .from('projects')
            .update({ status: 'active' })
            .eq('id', project_id);

          // Notify company
          const { data: quote } = await adminClient
            .from('quotes')
            .select('company_id, companies(user_id)')
            .eq('id', quote_id)
            .single();

          if (quote?.company_id) {
            const companyUserId = (quote.companies as { user_id: string })?.user_id;
            if (companyUserId) {
              await adminClient.from('notifications').insert({
                user_id: companyUserId,
                type: 'quote_approved',
                payload: {
                  project_id,
                  quote_id,
                  deep_link: `/(company)/job/${project_id}`,
                },
              });
            }
          }
        }
        break;
      }

      case 'account.updated': {
        // Company's Stripe Connect account updated (e.g., charges_enabled)
        const account = event.data.object as Stripe.Account;
        if (account.charges_enabled) {
          await adminClient
            .from('companies')
            .update({ stripe_account_id: account.id })
            .eq('stripe_account_id', account.id);
        }
        break;
      }

      case 'transfer.created': {
        // Payment released to company — update milestone to paid
        const transfer = event.data.object as Stripe.Transfer;
        const { milestone_id } = transfer.metadata;
        if (milestone_id) {
          await adminClient
            .from('milestones')
            .update({ status: 'paid', stripe_transfer_id: transfer.id })
            .eq('id', milestone_id)
            .is('stripe_transfer_id', null); // idempotent
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('stripe-webhook error:', err);
    return new Response(
      `Webhook Error: ${err instanceof Error ? err.message : String(err)}`,
      { status: 400 }
    );
  }
});
