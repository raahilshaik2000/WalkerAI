import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

function stripeReadiness(account: Stripe.Account) {
  return {
    stripe_details_submitted: account.details_submitted,
    stripe_payouts_enabled: account.payouts_enabled,
    stripe_transfers_active: account.capabilities?.transfers === 'active',
    stripe_onboarding_checked_at: new Date().toISOString(),
  };
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  return /column .* does not exist/i.test(message) || /schema cache/i.test(message);
}

async function updateStripeReadiness(
  adminClient: ReturnType<typeof createClient>,
  table: 'companies' | 'suppliers' | 'general_contractors',
  stripeAccountId: string,
  readiness: ReturnType<typeof stripeReadiness>,
) {
  const result = await adminClient
    .from(table)
    .update(readiness)
    .eq('stripe_account_id', stripeAccountId);

  if (!isMissingColumnError(result.error)) {
    if (result.error) throw result.error;
    return;
  }

  const fallback = await adminClient
    .from(table)
    .update({ stripe_account_id: stripeAccountId })
    .eq('stripe_account_id', stripeAccountId);
  if (fallback.error) throw fallback.error;
}

async function allFilledSlotsHaveApprovedQuotes(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  const { data: slots, error: slotsError } = await adminClient
    .from('project_slots')
    .select('id, assigned_company_id, status, fulfillment_type')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (slotsError) {
    throw new Error(`Failed to load project slots: ${slotsError.message}`);
  }

  const requiredSlots = (slots ?? []) as Array<{
    id: string;
    assigned_company_id: string | null;
    status: string | null;
    fulfillment_type: string | null;
  }>;
  if (requiredSlots.length === 0) return true;

  const externalSlotsReady = requiredSlots
    .filter((slot) => slot.fulfillment_type === 'external')
    .every((slot) => ['filled', 'scheduled'].includes(slot.status ?? ''));
  if (!externalSlotsReady) return false;

  const quoteRequiredSlots = requiredSlots.filter((slot) => slot.fulfillment_type !== 'external');
  if (quoteRequiredSlots.length === 0) return true;

  const allSlotsAssigned = quoteRequiredSlots.every((slot) => (
    !!slot.assigned_company_id && ['filled', 'scheduled'].includes(slot.status ?? '')
  ));
  if (!allSlotsAssigned) return false;

  const requiredCompanyIds = quoteRequiredSlots
    .map((slot) => slot.assigned_company_id)
    .filter((id): id is string => Boolean(id));

  const approvedQuoteResult = await adminClient
    .from('quotes')
    .select('slot_id, company_id')
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .in('company_id', requiredCompanyIds);

  if (isMissingColumnError(approvedQuoteResult.error)) {
    const legacyQuoteResult = await adminClient
      .from('quotes')
      .select('company_id')
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .in('company_id', requiredCompanyIds);

    if (legacyQuoteResult.error) {
      throw new Error(`Failed to load approved slot quotes: ${legacyQuoteResult.error.message}`);
    }

    const approvedCompanyIds = new Set(
      ((legacyQuoteResult.data ?? []) as Array<{ company_id: string | null }>)
        .map((quote) => quote.company_id)
        .filter((id): id is string => Boolean(id))
    );

    return quoteRequiredSlots.every((slot) => (
      !!slot.assigned_company_id && approvedCompanyIds.has(slot.assigned_company_id)
    ));
  }

  if (approvedQuoteResult.error) {
    throw new Error(`Failed to load approved slot quotes: ${approvedQuoteResult.error.message}`);
  }

  const quotes = (approvedQuoteResult.data ?? []) as Array<{ slot_id: string | null; company_id: string | null }>;
  const approvedSlotIds = new Set(quotes.map((quote) => quote.slot_id).filter((id): id is string => Boolean(id)));
  const companySlotCounts = quoteRequiredSlots.reduce<Record<string, number>>((counts, slot) => {
    if (slot.assigned_company_id) counts[slot.assigned_company_id] = (counts[slot.assigned_company_id] ?? 0) + 1;
    return counts;
  }, {});
  const legacyApprovedCompanyIds = new Set(
    quotes
      .filter((quote) => !quote.slot_id && quote.company_id && companySlotCounts[quote.company_id] === 1)
      .map((quote) => quote.company_id as string)
  );

  return quoteRequiredSlots.every((slot) => (
    approvedSlotIds.has(slot.id)
    || (!!slot.assigned_company_id && legacyApprovedCompanyIds.has(slot.assigned_company_id))
  ));
}

async function projectHasTradeSlots(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  const { data: slots, error } = await adminClient
    .from('project_slots')
    .select('id')
    .eq('project_id', projectId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check project schedule requirement: ${error.message}`);
  }

  return (slots?.length ?? 0) > 0;
}

async function projectScheduleConfirmed(
  adminClient: ReturnType<typeof createClient>,
  projectId: string,
): Promise<boolean> {
  let projectStateResult = await adminClient
    .from('projects')
    .select('id, scheduling_status')
    .eq('id', projectId)
    .single();

  if (isMissingColumnError(projectStateResult.error)) {
    projectStateResult = await adminClient
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();
    if (projectStateResult.error) throw projectStateResult.error;
    return true;
  }

  if (projectStateResult.error) {
    throw projectStateResult.error;
  }

  return projectStateResult.data?.scheduling_status === 'confirmed';
}

// No CORS headers — Stripe webhook hits this directly, not from browser
Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
  );

  try {
    const sig = req.headers.get('stripe-signature');
    if (!sig) return new Response('Missing signature', { status: 400 });

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);

    // Idempotency — skip if already processed
    const { data: existing, error: existingError } = await adminClient
      .from('processed_stripe_events')
      .select('stripe_event_id')
      .eq('stripe_event_id', event.id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) return new Response(JSON.stringify({ received: true, skipped: true }));

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { project_id, quote_id, gc_concierge_booking_id } = pi.metadata;
        if (gc_concierge_booking_id) {
          const { data: booking, error: bookingLookupError } = await adminClient
            .from('gc_concierge_bookings')
            .select('id, project_id, general_contractor_id, stripe_payment_intent_id, payment_status, general_contractors(user_id)')
            .eq('id', gc_concierge_booking_id)
            .single();

          if (bookingLookupError || !booking) {
            throw new Error(`Concierge booking not found for payment_intent ${pi.id}`);
          }

          if (booking.project_id !== project_id || booking.stripe_payment_intent_id !== pi.id) {
            throw new Error(`PaymentIntent metadata does not match concierge booking ${gc_concierge_booking_id}`);
          }

          const { data: updatedBooking, error: bookingUpdateError } = await adminClient
            .from('gc_concierge_bookings')
            .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', gc_concierge_booking_id)
            .eq('stripe_payment_intent_id', pi.id)
            .neq('payment_status', 'paid')
            .select('id')
            .maybeSingle();
          if (bookingUpdateError) throw bookingUpdateError;

          if (updatedBooking) {
            const gc = Array.isArray(booking.general_contractors)
              ? booking.general_contractors[0]
              : booking.general_contractors as { user_id: string } | null;
            if (gc?.user_id) {
              const { error: notificationError } = await adminClient.from('notifications').insert({
                user_id: gc.user_id,
                type: 'gc_concierge_booking_paid',
                payload: {
                  project_id,
                  concierge_booking_id: gc_concierge_booking_id,
                  payment_intent_id: pi.id,
                },
              });
              if (notificationError) console.warn('gc_concierge_booking_paid notification failed:', notificationError);
            }
          }
        }

        if (project_id && quote_id) {
          let quoteResult = await adminClient
            .from('quotes')
            .select('id, project_id, slot_id, status, stripe_payment_intent_id, company_id, companies(user_id)')
            .eq('id', quote_id)
            .single();

          if (isMissingColumnError(quoteResult.error)) {
            quoteResult = await adminClient
              .from('quotes')
              .select('id, project_id, status, stripe_payment_intent_id, company_id, companies(user_id)')
              .eq('id', quote_id)
              .single();
            if (quoteResult.data) {
              quoteResult.data = { ...quoteResult.data, slot_id: null };
            }
          }

          const { data: quote, error: quoteLookupError } = quoteResult;
          if (quoteLookupError || !quote) {
            throw new Error(`Quote not found for payment_intent ${pi.id}`);
          }

          if (quote.project_id !== project_id || quote.stripe_payment_intent_id !== pi.id) {
            throw new Error(`PaymentIntent metadata does not match quote ${quote_id}`);
          }

          const { data: updatedQuote, error: quoteUpdateError } = await adminClient
            .from('quotes')
            .update({ status: 'approved', approved_at: new Date().toISOString() })
            .eq('id', quote_id)
            .eq('stripe_payment_intent_id', pi.id)
            .in('status', ['pending', 'approved'])
            .select('id')
            .maybeSingle();
          if (quoteUpdateError) throw quoteUpdateError;
          if (!updatedQuote) throw new Error(`Quote ${quote_id} was not eligible for payment approval`);

          const readyForActive = await allFilledSlotsHaveApprovedQuotes(adminClient, project_id);
          if (readyForActive) {
            const scheduleRequired = await projectHasTradeSlots(adminClient, project_id);
            const scheduleConfirmed = !scheduleRequired || await projectScheduleConfirmed(adminClient, project_id);
            const nextProjectState = scheduleConfirmed
              ? { status: 'active' }
              : { status: 'scheduling', scheduling_status: 'pending_homeowner' };

            const { data: updatedProject, error: projectUpdateError } = await adminClient
              .from('projects')
              .update(nextProjectState)
              .eq('id', project_id)
              .select('id')
              .maybeSingle();
            if (projectUpdateError) throw projectUpdateError;
            if (!updatedProject) throw new Error(`Project ${project_id} could not be updated after payment`);

            if (scheduleConfirmed) {
              try {
                const orderRes = await fetch(`${supabaseUrl}/functions/v1/generate-material-orders`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ project_id }),
                });
                if (!orderRes.ok) {
                  console.warn(`generate-material-orders after payment failed: ${await orderRes.text()}`);
                }
              } catch (orderError) {
                console.warn('generate-material-orders after payment failed:', orderError);
              }
            }
          }

          if (quote?.company_id) {
            const company = Array.isArray(quote.companies)
              ? quote.companies[0]
              : quote.companies as { user_id: string } | null;
            const companyUserId = company?.user_id;
            if (companyUserId) {
              const { error: notificationError } = await adminClient.from('notifications').insert({
                user_id: companyUserId,
                type: 'quote_approved',
                payload: {
                  project_id,
                  quote_id,
                  slot_id: quote.slot_id,
                  deep_link: `/(company)/job/${project_id}`,
                },
              });
              if (notificationError) console.warn('quote_approved notification failed:', notificationError);
            }
          }
        }
        break;
      }

      case 'account.updated': {
        // Stripe Connect account updated for a contractor or supplier.
        const account = event.data.object as Stripe.Account;
        const readiness = stripeReadiness(account);

        await updateStripeReadiness(adminClient, 'companies', account.id, readiness);
        await updateStripeReadiness(adminClient, 'suppliers', account.id, readiness);
        await updateStripeReadiness(adminClient, 'general_contractors', account.id, readiness);
        break;
      }

      case 'transfer.created': {
        // Payment released to company — update milestone to paid
        const transfer = event.data.object as Stripe.Transfer;
        const { milestone_id } = transfer.metadata;
        if (milestone_id) {
          const { error: milestoneUpdateError } = await adminClient
            .from('milestones')
            .update({ status: 'paid', stripe_transfer_id: transfer.id })
            .eq('id', milestone_id)
            .is('stripe_transfer_id', null); // idempotent
          if (milestoneUpdateError) throw milestoneUpdateError;
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        // Card declined / payment failed. Leave the quote pending so the
        // homeowner can retry, but notify them so they know to act.
        const pi = event.data.object as Stripe.PaymentIntent;
        const { project_id } = pi.metadata;
        if (project_id) {
          const { data: project } = await adminClient
            .from('projects')
            .select('homeowner_id')
            .eq('id', project_id)
            .maybeSingle();
          const homeownerId = (project as { homeowner_id?: string } | null)?.homeowner_id;
          if (homeownerId) {
            const { error: notifyError } = await adminClient.from('notifications').insert({
              user_id: homeownerId,
              type: 'payment_failed',
              payload: {
                project_id,
                quote_id: pi.metadata.quote_id ?? null,
                payment_intent_id: pi.id,
                message: pi.last_payment_error?.message
                  ?? 'Your payment did not go through. Please try again or use a different card.',
                deep_link: `/(homeowner)/project/${project_id}`,
              },
            });
            if (notifyError) console.warn('payment_failed notification failed:', notifyError);
          }
        }
        break;
      }

      case 'charge.dispute.created': {
        // A chargeback was opened. Flag the project and notify the homeowner so
        // the dispute is reflected in app state, not just in Stripe.
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
        if (paymentIntentId) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          const projectId = pi.metadata?.project_id;
          if (projectId) {
            const { error: flagError } = await adminClient
              .from('projects')
              .update({ status: 'disputed' })
              .eq('id', projectId)
              .neq('status', 'disputed');
            if (flagError) console.warn('dispute project flag failed:', flagError);

            const { data: project } = await adminClient
              .from('projects')
              .select('homeowner_id')
              .eq('id', projectId)
              .maybeSingle();
            const homeownerId = (project as { homeowner_id?: string } | null)?.homeowner_id;
            if (homeownerId) {
              const { error: notifyError } = await adminClient.from('notifications').insert({
                user_id: homeownerId,
                type: 'payment_disputed',
                payload: {
                  project_id: projectId,
                  dispute_id: dispute.id,
                  amount: dispute.amount,
                  reason: dispute.reason,
                  message: 'A payment dispute was opened on this project.',
                  deep_link: `/(homeowner)/project/${projectId}`,
                },
              });
              if (notifyError) console.warn('payment_disputed notification failed:', notifyError);
            }
          }
        }
        break;
      }

      case 'charge.dispute.closed': {
        // Dispute resolved. On a won dispute, restore the project from
        // 'disputed'; on a lost dispute, leave it flagged for manual handling.
        const dispute = event.data.object as Stripe.Dispute;
        const paymentIntentId = typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
        if (paymentIntentId) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          const projectId = pi.metadata?.project_id;
          if (projectId) {
            if (dispute.status === 'won') {
              const { error: restoreError } = await adminClient
                .from('projects')
                .update({ status: 'active' })
                .eq('id', projectId)
                .eq('status', 'disputed');
              if (restoreError) console.warn('dispute restore failed:', restoreError);
            }

            const { data: project } = await adminClient
              .from('projects')
              .select('homeowner_id')
              .eq('id', projectId)
              .maybeSingle();
            const homeownerId = (project as { homeowner_id?: string } | null)?.homeowner_id;
            if (homeownerId) {
              const { error: notifyError } = await adminClient.from('notifications').insert({
                user_id: homeownerId,
                type: 'payment_dispute_resolved',
                payload: {
                  project_id: projectId,
                  dispute_id: dispute.id,
                  outcome: dispute.status,
                  deep_link: `/(homeowner)/project/${projectId}`,
                },
              });
              if (notifyError) console.warn('payment_dispute_resolved notification failed:', notifyError);
            }
          }
        }
        break;
      }

      case 'transfer.reversed': {
        // A released payout was reversed (e.g. following a dispute or refund).
        // Roll back whichever payout it funded, matched by transfer id so it is
        // independent of metadata shape (milestone vs supplier order).
        const transfer = event.data.object as Stripe.Transfer;
        const { error: milestoneError } = await adminClient
          .from('milestones')
          .update({ status: 'homeowner_approved', stripe_transfer_id: null })
          .eq('stripe_transfer_id', transfer.id);
        if (milestoneError) console.warn('milestone reversal rollback failed:', milestoneError);

        const { error: orderError } = await adminClient
          .from('material_orders')
          .update({ status: 'delivered', stripe_transfer_id: null })
          .eq('stripe_transfer_id', transfer.id);
        if (orderError && !isMissingColumnError(orderError)) {
          console.warn('material order reversal rollback failed:', orderError);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    const { error: processedInsertError } = await adminClient
      .from('processed_stripe_events')
      .insert({ stripe_event_id: event.id });
    if (processedInsertError && processedInsertError.code !== '23505') throw processedInsertError;

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
