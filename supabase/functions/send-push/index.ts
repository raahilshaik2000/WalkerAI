import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'npm:jose@5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  notification_id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
}

function textValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function moneySuffix(value: unknown, prefix: string): string {
  return typeof value === 'number' ? `${prefix}$${formatCad(value)}` : '';
}

function projectTypeLabel(projectType: unknown, roomType: unknown): string {
  const value = typeof projectType === 'string' && projectType.trim().length > 0
    ? projectType
    : typeof roomType === 'string' && roomType.trim().length > 0
      ? roomType
      : null;
  if (!value) return 'Renovation';
  const label = value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  return value === 'kitchen' || value === 'bathroom' ? `${label} Renovation` : label;
}

function dispatchEstimateText(payload: Record<string, unknown>): string {
  const min = typeof payload.estimated_cost_min === 'number'
    ? payload.estimated_cost_min
    : payload.ai_cost_min;
  const max = typeof payload.estimated_cost_max === 'number'
    ? payload.estimated_cost_max
    : payload.ai_cost_max;

  if (typeof min === 'number' && typeof max === 'number') {
    return ` — estimated $${formatCad(min)}–$${formatCad(max)}`;
  }
  if (typeof min === 'number') return ` — estimated from $${formatCad(min)}`;
  if (typeof max === 'number') return ` — estimated up to $${formatCad(max)}`;
  return '';
}

// Apple-specific response codes that mean the token is dead and should be
// marked inactive in device_tokens so we stop trying to deliver to it.
const DEAD_TOKEN_REASONS = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
  'TopicDisallowed',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { notification_id, user_id, type, payload }: PushPayload = await req.json();

    // ── Preference check ────────────────────────────────────────────
    const preferenceKey = notificationPreferenceKey(type);
    if (preferenceKey) {
      const { data: prefs, error: prefsError } = await supabase
        .from('notification_preferences')
        .select(preferenceKey)
        .eq('user_id', user_id)
        .maybeSingle();

      if (prefsError) throw prefsError;
      if (prefs && prefs[preferenceKey] === false) {
        await supabase
          .from('notifications')
          .update({
            push_sent: false,
            push_sent_at: new Date().toISOString(),
            push_error: 'PREFERENCE_DISABLED',
          })
          .eq('id', notification_id);

        return new Response(JSON.stringify({ sent: 0, skipped: 'preference_disabled' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Active device tokens ────────────────────────────────────────
    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      await supabase
        .from('notifications')
        .update({
          push_sent: false,
          push_sent_at: new Date().toISOString(),
          push_error: 'NO_ACTIVE_DEVICE_TOKENS',
        })
        .eq('id', notification_id);
      return new Response(JSON.stringify({ sent: 0, skipped: 'no_tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token);
    if (iosTokens.length === 0) {
      // No iOS tokens. Android/web pushes aren't wired yet.
      await supabase
        .from('notifications')
        .update({
          push_sent: false,
          push_sent_at: new Date().toISOString(),
          push_error: 'NO_IOS_TOKENS',
        })
        .eq('id', notification_id);
      return new Response(JSON.stringify({ sent: 0, skipped: 'no_ios_tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Build the message ───────────────────────────────────────────
    const content = buildNotificationContent(type, payload);

    // ── APNs auth setup ─────────────────────────────────────────────
    const apnsKey = Deno.env.get('APNS_KEY');
    const apnsKeyId = Deno.env.get('APNS_KEY_ID');
    const apnsTeamId = Deno.env.get('APNS_TEAM_ID');
    const apnsBundleId = Deno.env.get('APNS_BUNDLE_ID') ?? 'com.walkerai.app';
    const useProduction = (Deno.env.get('APNS_USE_PRODUCTION') ?? 'true').toLowerCase() !== 'false';

    if (!apnsKey || !apnsKeyId || !apnsTeamId) {
      // Mark as failed but don't 500 — the notification row exists, the user
      // just won't get a push until secrets are configured.
      await supabase
        .from('notifications')
        .update({
          push_sent: false,
          push_sent_at: new Date().toISOString(),
          push_error: 'APNS_NOT_CONFIGURED',
        })
        .eq('id', notification_id);
      return new Response(
        JSON.stringify({ error: 'APNS_NOT_CONFIGURED', detail: 'APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID secrets required' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = await buildApnsJwt({ key: apnsKey, keyId: apnsKeyId, teamId: apnsTeamId });
    const apnsHost = useProduction ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';

    // ── Deliver ─────────────────────────────────────────────────────
    const invalidTokens: string[] = [];
    let delivered = 0;
    let errored = 0;

    const apsPayload = {
      aps: {
        alert: { title: content.title, body: content.body },
        sound: 'default',
        ...(content.priority === 'high' && { 'interruption-level': 'time-sensitive' as const }),
      },
      type,
      ...payload,
    };
    const body = JSON.stringify(apsPayload);

    // Send concurrently — each fetch is independent. Limit to 32 at a time so
    // we don't overwhelm the function's event loop on large fan-outs.
    const CONCURRENCY = 32;
    for (let i = 0; i < iosTokens.length; i += CONCURRENCY) {
      const chunk = iosTokens.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async (token) => {
        try {
          const res = await fetch(`https://${apnsHost}/3/device/${token}`, {
            method: 'POST',
            headers: {
              'authorization': `bearer ${jwt}`,
              'apns-topic': apnsBundleId,
              'apns-push-type': 'alert',
              'apns-priority': content.priority === 'high' ? '10' : '5',
              ...(content.ttl && { 'apns-expiration': String(Math.floor(Date.now() / 1000) + content.ttl) }),
              'content-type': 'application/json',
            },
            body,
          });
          if (res.status === 200) {
            delivered += 1;
            return;
          }
          errored += 1;
          let reason = '';
          try {
            const errBody = await res.json();
            reason = (errBody as { reason?: string }).reason ?? '';
          } catch {
            reason = `HTTP_${res.status}`;
          }
          console.error(`APNs ${res.status} for token ${token.substring(0, 8)}...: ${reason}`);
          if (DEAD_TOKEN_REASONS.has(reason)) {
            invalidTokens.push(token);
          }
        } catch (err) {
          errored += 1;
          console.error(`APNs network error for token ${token.substring(0, 8)}...:`, err);
        }
      }));
    }

    // Mark dead tokens inactive so we don't keep trying.
    if (invalidTokens.length > 0) {
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .in('token', invalidTokens);
    }

    // Update notification row with the result.
    await supabase
      .from('notifications')
      .update({
        push_sent: delivered > 0,
        push_sent_at: new Date().toISOString(),
        push_error: delivered === 0 && errored > 0 ? `ALL_TOKENS_FAILED:${errored}` : null,
      })
      .eq('id', notification_id);

    return new Response(
      JSON.stringify({ sent: delivered, failed: errored, invalid: invalidTokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('send-push error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ── APNs JWT (ES256) ──────────────────────────────────────────────────
// Apple wants a short-lived JWT signed by the .p8 private key we generated
// in their developer portal. The token is bound to a team (iss claim) +
// signing key (kid header). Refreshed once per function invocation; Apple
// lets us reuse for up to ~60 min before requiring a new one.
async function buildApnsJwt(params: { key: string; keyId: string; teamId: string }): Promise<string> {
  // The APNS_KEY secret can be the raw .p8 contents (including header/footer)
  // or just the base64 body without headers. Normalize either form.
  const pem = params.key.includes('BEGIN PRIVATE KEY')
    ? params.key
    : `-----BEGIN PRIVATE KEY-----\n${params.key}\n-----END PRIVATE KEY-----`;
  const privateKey = await importPKCS8(pem, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: params.keyId })
    .setIssuer(params.teamId)
    .setIssuedAt(now)
    .sign(privateKey);
}

// ── Notification content + preferences (unchanged from previous version) ──
function buildNotificationContent(
  type: string,
  payload: Record<string, unknown>
): { title: string; body: string; priority: 'high' | 'normal' | 'default'; ttl?: number } {
  switch (type) {
    case 'job_dispatched':
    case 'slot_dispatched':
      return {
        title: '⚡ New Job Available — Act Fast',
        body: `${projectTypeLabel(payload.project_type, payload.room_type)} in ${payload.city ?? 'your area'}${dispatchEstimateText(payload)}. First to accept wins.`,
        priority: 'high',
        ttl: 7200, // 2 hours — matches dispatch window
      };
    case 'all_slots_filled':
      return {
        title: 'Ready to Schedule',
        body: 'Every required trade has accepted. Confirm the schedule to keep the project moving.',
        priority: 'high',
      };
    case 'schedule_confirmed':
      return {
        title: 'Schedule Confirmed',
        body: 'The project schedule has been confirmed.',
        priority: 'normal',
      };
    case 'job_filled':
      return {
        title: 'Job Taken',
        body: 'Another contractor accepted this project. Keep an eye out for the next one.',
        priority: 'normal',
      };
    case 'job_accepted':
    case 'slot_accepted':
      return {
        title: '🎉 A Contractor Accepted!',
        body: 'A verified contractor is ready for your project. Review their details.',
        priority: 'high',
      };
    case 'quote_submitted':
      return {
        title: 'Your Quote Is Ready',
        body: 'Your contractor has submitted their final quote. Review and approve to get started.',
        priority: 'high',
      };
    case 'quote_approved':
      return {
        title: 'Quote Funded',
        body: 'The homeowner funded your quote. Funds are held in escrow until milestones are approved.',
        priority: 'high',
      };
    case 'milestone_needs_approval':
    case 'milestone_completed':
      return {
        title: 'Milestone Complete — Approval Needed',
        body: `Your contractor marked a milestone complete. Approve to release payment.`,
        priority: 'high',
      };
    case 'milestone_paid':
      return {
        title: '💰 Milestone Payment Released',
        body: `$${formatCad(payload.amount)} is being deposited to your account.`,
        priority: 'normal',
      };
    case 'material_order_claimed':
      return {
        title: 'Material Order Claimed',
        body: (payload.message as string) ?? 'A supplier has claimed a material order for this project.',
        priority: 'normal',
      };
    case 'order_shipped':
      return {
        title: 'Material Order Shipped',
        body: (payload.message as string) ?? 'A material order for your project has shipped.',
        priority: 'normal',
      };
    case 'order_delivered':
      return {
        title: 'Material Order Delivered',
        body: (payload.message as string) ?? 'A material order was delivered. Confirm receipt to release payment.',
        priority: 'high',
      };
    case 'new_material_order':
      return {
        title: 'New Material Order Nearby',
        body: `${payload.order_count ?? 'New'} material order${payload.order_count === 1 ? '' : 's'} available${payload.city ? ` in ${payload.city}` : ''}.`,
        priority: 'high',
      };
    case 'supplier_paid':
      return {
        title: '💰 Supplier Payout Sent',
        body: `$${formatCad(payload.amount)} is being deposited to your account.`,
        priority: 'normal',
      };
    case 'gc_concierge_payout_released':
      return {
        title: '💰 Concierge Payout Released',
        body: `$${formatCad(payload.amount)} is being deposited to your account.`,
        priority: 'normal',
      };
    case 'gc_approval_requested':
      return {
        title: 'GC Approval Needed',
        body: (payload.title as string) ?? 'A General Contractor recommendation needs your approval.',
        priority: 'high',
      };
    case 'gc_approval_responded':
      return {
        title: 'Homeowner Responded',
        body: `${textValue(payload.title, 'A GC recommendation')} was ${textValue(payload.status, 'updated')}.`,
        priority: 'normal',
      };
    case 'gc_management_invited':
      return {
        title: 'GC Management Approval Needed',
        body: (payload.message as string) ?? 'A General Contractor created a draft project for your approval.',
        priority: 'high',
      };
    case 'gc_management_invite_received':
      return {
        title: 'GC Management Invite',
        body: (payload.message as string) ?? 'A homeowner invited you to manage their project.',
        priority: 'high',
      };
    case 'gc_management_confirmed':
      return {
        title: 'GC Management Active',
        body: (payload.message as string) ?? 'GC management is now active for this project.',
        priority: 'high',
      };
    case 'gc_payment_requested':
      return {
        title: 'GC Payment Request',
        body: `${textValue(payload.title, 'A payment request')} needs homeowner approval${moneySuffix(payload.amount_cents, ' for ')}.`,
        priority: 'high',
      };
    case 'gc_payment_responded':
      return {
        title: 'Payment Request Updated',
        body: `${textValue(payload.title, 'A payment request')} was ${textValue(payload.status, 'updated')}.`,
        priority: 'normal',
      };
    case 'gc_concierge_booking_requested':
      return {
        title: 'New Concierge Request',
        body: `${textValue(payload.title, 'A homeowner requested concierge help')}${moneySuffix(payload.price_cents, ' for ')}.`,
        priority: 'high',
      };
    case 'gc_concierge_booking_responded':
      return {
        title: 'Concierge Request Updated',
        body: `${textValue(payload.title, 'A concierge request')} was ${textValue(payload.status, 'updated')}.`,
        priority: 'normal',
      };
    case 'gc_concierge_booking_paid':
      return {
        title: 'Concierge Booking Paid',
        body: 'The homeowner paid for the accepted concierge booking.',
        priority: 'high',
      };
    case 'gc_trade_negotiation_requested':
      return {
        title: 'Quote Revision Requested',
        body: `${textValue(payload.general_contractor_name, 'A General Contractor')} requested a quote revision${moneySuffix(payload.offer_amount_cents, ' at ')}.`,
        priority: 'high',
      };
    case 'gc_trade_negotiation_responded':
      return {
        title: 'Trade Responded',
        body: `${textValue(payload.company_name, 'A trade')} ${textValue(payload.status, 'responded')} to your quote negotiation.`,
        priority: 'normal',
      };
    case 'project_complete':
      return {
        title: 'Project Complete',
        body: (payload.message as string) ?? 'The project is complete. Review the closeout details.',
        priority: 'normal',
      };
    case 'new_message':
      return {
        title: 'New Message',
        body: (payload.preview as string) ?? 'You have a new message',
        priority: 'normal',
      };
    case 'dispute_raised':
      return {
        title: '⚠️ Dispute Opened',
        body: 'A dispute has been raised on your project. Our team will review within 1 business day.',
        priority: 'high',
      };
    case 'dispatch_no_match':
      return {
        title: 'Expanding Search',
        body: 'No contractor accepted yet. We\'re widening the search area.',
        priority: 'normal',
      };
    case 'warranty_expiring': {
      const daysLeft = payload.days_left as number ?? 30;
      return {
        title: `Warranty Expires in ${daysLeft} Days`,
        body: 'Review your warranty details before coverage lapses.',
        priority: 'normal',
      };
    }
    case 'trade_en_route':
      return {
        title: 'Your Contractor Is on the Way',
        body: `${textValue(payload.company_name, 'Your contractor')} is heading to your project now.`,
        priority: 'high',
      };
    case 'trade_needs_approval':
      return {
        title: 'Trade Complete, Approval Needed',
        body: 'Your contractor marked their work complete. Review the photos and approve to release payment.',
        priority: 'high',
      };
    case 'trade_payout_paid':
      return {
        title: '💰 Payout Released',
        body: `$${formatCad(payload.amount)} is being deposited to your account.`,
        priority: 'normal',
      };
    case 'trade_turn_started':
      return {
        title: 'Your Turn to Start',
        body: 'The previous trade is done. You can begin your work now.',
        priority: 'high',
      };
    case 'project_funded':
      return {
        title: 'Project Funded',
        body: 'The project is funded and ready to move forward.',
        priority: 'high',
      };
    case 'payment_failed':
      return {
        title: "Payment Didn't Go Through",
        body: textValue(payload.message, 'Your payment did not go through. Please try again or use a different card.'),
        priority: 'high',
      };
    case 'payment_disputed':
      return {
        title: '⚠️ Payment Dispute Opened',
        body: textValue(payload.message, 'A payment dispute was opened on this project.'),
        priority: 'high',
      };
    case 'payment_dispute_resolved':
      return {
        title: 'Payment Dispute Resolved',
        body: `The payment dispute on your project was resolved${payload.outcome ? ` (${textValue(payload.outcome, 'closed')})` : ''}.`,
        priority: 'normal',
      };
    default:
      return {
        title: 'WalkerAI',
        body: 'You have a new update.',
        priority: 'default',
      };
  }
}

function formatCad(cents: unknown): string {
  if (typeof cents !== 'number') return '?';
  return new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(cents / 100);
}

function notificationPreferenceKey(type: string): string | null {
  switch (type) {
    case 'new_message':
      return 'messages';
    case 'job_dispatched':
    case 'slot_dispatched':
    case 'job_filled':
      return 'job_dispatch';
    case 'quote_submitted':
    case 'quote_approved':
      return 'quote_updates';
    case 'milestone_paid':
    case 'supplier_paid':
    case 'gc_concierge_payout_released':
    case 'trade_payout_paid':
    case 'project_funded':
    case 'payment_failed':
    case 'payment_disputed':
    case 'payment_dispute_resolved':
      return 'payment_updates';
    case 'job_accepted':
    case 'slot_accepted':
    case 'milestone_needs_approval':
    case 'milestone_completed':
    case 'trade_needs_approval':
    case 'trade_turn_started':
    case 'trade_en_route':
    case 'dispute_raised':
    case 'project_complete':
    case 'all_slots_filled':
    case 'schedule_confirmed':
    case 'material_order_claimed':
    case 'new_material_order':
    case 'order_shipped':
    case 'order_delivered':
    case 'gc_approval_requested':
    case 'gc_approval_responded':
    case 'gc_management_invited':
    case 'gc_management_invite_received':
    case 'gc_management_confirmed':
    case 'gc_payment_requested':
    case 'gc_payment_responded':
    case 'gc_concierge_booking_requested':
    case 'gc_concierge_booking_responded':
    case 'gc_concierge_booking_paid':
    case 'gc_trade_negotiation_requested':
    case 'gc_trade_negotiation_responded':
      return 'milestone_updates';
    case 'warranty_expiring':
      return 'warranty_reminders';
    default:
      return null;
  }
}
