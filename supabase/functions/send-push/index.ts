import { createClient } from 'jsr:@supabase/supabase-js@2';

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

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: string;
  priority: 'default' | 'normal' | 'high';
  ttl?: number;
  badge?: number;
  channelId?: string;
}

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

    // Get active device tokens for this user
    const { data: tokens, error: tokenError } = await supabase
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', user_id)
      .eq('is_active', true);

    if (tokenError) throw tokenError;
    if (!tokens || tokens.length === 0) {
      // No tokens — user has no devices registered, that's fine
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build notification content based on type
    const { title, body, priority, ttl } = buildNotificationContent(type, payload);

    // Build Expo push messages (one per device token)
    const messages: ExpoPushMessage[] = tokens.map((t: { token: string; platform: string }) => ({
      to: t.token,
      title,
      body,
      data: {
        type,
        notification_id,
        deep_link: payload.deep_link as string ?? '/',
        ...payload,
      },
      sound: 'default',
      priority,
      ...(ttl && { ttl }),
      channelId: 'default',
    }));

    // Send to Expo Push API (batch up to 100 per request)
    const BATCH_SIZE = 100;
    const invalidTokens: string[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error('Expo Push API error:', response.status, await response.text());
        continue;
      }

      const result = await response.json();
      const ticketData = result.data as Array<{ status: string; details?: { error?: string } }>;

      // Process tickets — check for invalid tokens
      for (let j = 0; j < ticketData.length; j++) {
        const ticket = ticketData[j];
        if (ticket.status === 'error') {
          const errorCode = ticket.details?.error;
          if (errorCode === 'DeviceNotRegistered') {
            invalidTokens.push(batch[j].to);
          }
        }
      }
    }

    // Deactivate invalid tokens
    if (invalidTokens.length > 0) {
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .in('token', invalidTokens);
    }

    // Mark notification as push-sent
    await supabase
      .from('notifications')
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq('id', notification_id);

    return new Response(
      JSON.stringify({ sent: messages.length - invalidTokens.length, invalid: invalidTokens.length }),
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

function buildNotificationContent(
  type: string,
  payload: Record<string, unknown>
): { title: string; body: string; priority: 'high' | 'normal' | 'default'; ttl?: number } {
  switch (type) {
    case 'job_dispatched':
      return {
        title: '⚡ New Job Available — Act Fast',
        body: `${payload.room_type ?? 'Renovation'} in ${payload.city ?? 'your area'} — estimated $${formatCad(payload.ai_cost_min)}–$${formatCad(payload.ai_cost_max)}. First to accept wins.`,
        priority: 'high',
        ttl: 7200, // 2 hours — matches dispatch window
      };
    case 'job_filled':
      return {
        title: 'Job Taken',
        body: 'Another contractor accepted this project. Keep an eye out for the next one.',
        priority: 'normal',
      };
    case 'job_accepted':
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
        title: 'Quote Approved — Project Active',
        body: 'The homeowner approved your quote. The project is now active.',
        priority: 'high',
      };
    case 'milestone_needs_approval':
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
    case 'warranty_expiring':
      const daysLeft = payload.days_left as number ?? 30;
      return {
        title: `Warranty Expires in ${daysLeft} Days`,
        body: 'Review your warranty details before coverage lapses.',
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
