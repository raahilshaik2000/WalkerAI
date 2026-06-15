export interface NotificationDisplayMeta {
  emoji: string;
  title: string;
  timelineIcon: string;
  color: string;
  timelineLabel: string;
}

const META: Record<string, NotificationDisplayMeta> = {
  job_accepted: {
    emoji: '🎉',
    title: 'Contractor accepted your project',
    timelineIcon: 'checkmark-circle-outline',
    color: '#34D399',
    timelineLabel: 'Contractor accepted your project',
  },
  slot_accepted: {
    emoji: '🎉',
    title: 'A trade accepted your project',
    timelineIcon: 'checkmark-circle-outline',
    color: '#34D399',
    timelineLabel: 'A trade accepted your project',
  },
  all_slots_filled: {
    emoji: '📅',
    title: 'Ready to schedule',
    timelineIcon: 'calendar-outline',
    color: '#60A5FA',
    timelineLabel: 'All trades accepted - ready to schedule',
  },
  schedule_confirmed: {
    emoji: '📅',
    title: 'Schedule confirmed',
    timelineIcon: 'calendar-outline',
    color: '#60A5FA',
    timelineLabel: 'Schedule confirmed',
  },
  quote_submitted: {
    emoji: '📄',
    title: 'Your quote is ready',
    timelineIcon: 'document-text-outline',
    color: '#F59E0B',
    timelineLabel: 'New quote received from contractor',
  },
  quote_approved: {
    emoji: '✅',
    title: 'Quote approved',
    timelineIcon: 'checkmark-circle-outline',
    color: '#34D399',
    timelineLabel: 'Quote approved - project is active',
  },
  milestone_needs_approval: {
    emoji: '✅',
    title: 'Milestone approval needed',
    timelineIcon: 'flag-outline',
    color: '#60A5FA',
    timelineLabel: 'Milestone completed - approve to release payment',
  },
  milestone_completed: {
    emoji: '✅',
    title: 'Milestone complete',
    timelineIcon: 'flag-outline',
    color: '#60A5FA',
    timelineLabel: 'Milestone completed',
  },
  milestone_paid: {
    emoji: '💰',
    title: 'Milestone payment released',
    timelineIcon: 'cash-outline',
    color: '#34D399',
    timelineLabel: 'Milestone payment released',
  },
  payment_released: {
    emoji: '💰',
    title: 'Payment released',
    timelineIcon: 'cash-outline',
    color: '#34D399',
    timelineLabel: 'Payment released to contractor',
  },
  project_complete: {
    emoji: '🏆',
    title: 'Project complete',
    timelineIcon: 'trophy-outline',
    color: '#FF6B00',
    timelineLabel: 'Project complete - review requested',
  },
  dispute_raised: {
    emoji: '⚠️',
    title: 'Dispute opened',
    timelineIcon: 'alert-circle-outline',
    color: '#F59E0B',
    timelineLabel: 'Dispute opened on a milestone',
  },
  dispatch_no_match: {
    emoji: '📡',
    title: 'Expanding contractor search',
    timelineIcon: 'radio-outline',
    color: '#A78BFA',
    timelineLabel: 'Expanding contractor search',
  },
  job_dispatched: {
    emoji: '⚡',
    title: 'New job available',
    timelineIcon: 'send-outline',
    color: '#A78BFA',
    timelineLabel: 'New job available',
  },
  slot_dispatched: {
    emoji: '⚡',
    title: 'New project slot available',
    timelineIcon: 'send-outline',
    color: '#A78BFA',
    timelineLabel: 'New trade slot available',
  },
  job_filled: {
    emoji: '📭',
    title: 'Job taken',
    timelineIcon: 'briefcase-outline',
    color: '#6B7280',
    timelineLabel: 'This job was accepted by another contractor',
  },
  new_message: {
    emoji: '💬',
    title: 'New message',
    timelineIcon: 'chatbubble-ellipses-outline',
    color: '#60A5FA',
    timelineLabel: 'New message',
  },
  warranty_expiring: {
    emoji: '📋',
    title: 'Warranty expiring soon',
    timelineIcon: 'shield-checkmark-outline',
    color: '#F59E0B',
    timelineLabel: 'Warranty expiring soon',
  },
  material_order_claimed: {
    emoji: '📦',
    title: 'Material order claimed',
    timelineIcon: 'cube-outline',
    color: '#34D399',
    timelineLabel: 'Material order claimed',
  },
  new_material_order: {
    emoji: '📦',
    title: 'New material order nearby',
    timelineIcon: 'cube-outline',
    color: '#A78BFA',
    timelineLabel: 'New material order nearby',
  },
  supplier_paid: {
    emoji: '💰',
    title: 'Supplier payout sent',
    timelineIcon: 'cash-outline',
    color: '#34D399',
    timelineLabel: 'Supplier payout sent',
  },
  gc_approval_requested: {
    emoji: '✅',
    title: 'GC approval needed',
    timelineIcon: 'checkmark-done-circle-outline',
    color: '#60A5FA',
    timelineLabel: 'GC recommendation needs homeowner approval',
  },
  gc_approval_responded: {
    emoji: '✅',
    title: 'Homeowner responded',
    timelineIcon: 'checkmark-done-circle-outline',
    color: '#34D399',
    timelineLabel: 'Homeowner responded to a GC recommendation',
  },
  gc_management_invited: {
    emoji: '🧭',
    title: 'GC management approval needed',
    timelineIcon: 'compass-outline',
    color: '#A78BFA',
    timelineLabel: 'GC management approval needed',
  },
  gc_payment_requested: {
    emoji: '💰',
    title: 'GC payment request',
    timelineIcon: 'cash-outline',
    color: '#F59E0B',
    timelineLabel: 'GC payment request needs homeowner approval',
  },
  gc_payment_responded: {
    emoji: '💰',
    title: 'Payment request updated',
    timelineIcon: 'cash-outline',
    color: '#34D399',
    timelineLabel: 'Homeowner responded to a GC payment request',
  },
  gc_concierge_booking_requested: {
    emoji: '🧭',
    title: 'Concierge request',
    timelineIcon: 'compass-outline',
    color: '#A78BFA',
    timelineLabel: 'New concierge service request',
  },
  gc_concierge_booking_responded: {
    emoji: '🧭',
    title: 'Concierge request updated',
    timelineIcon: 'compass-outline',
    color: '#34D399',
    timelineLabel: 'GC responded to a concierge service request',
  },
  gc_concierge_booking_paid: {
    emoji: '💰',
    title: 'Concierge booking paid',
    timelineIcon: 'cash-outline',
    color: '#34D399',
    timelineLabel: 'Homeowner paid a concierge service booking',
  },
  gc_concierge_payout_released: {
    emoji: '💰',
    title: 'Concierge payout released',
    timelineIcon: 'cash-outline',
    color: '#34D399',
    timelineLabel: 'Concierge payout released to GC',
  },
  gc_trade_negotiation_requested: {
    emoji: '💬',
    title: 'Quote revision requested',
    timelineIcon: 'chatbubble-ellipses-outline',
    color: '#F59E0B',
    timelineLabel: 'GC requested a trade quote revision',
  },
  gc_trade_negotiation_responded: {
    emoji: '💬',
    title: 'Trade responded',
    timelineIcon: 'chatbubble-ellipses-outline',
    color: '#34D399',
    timelineLabel: 'Trade responded to a GC quote negotiation',
  },
  order_shipped: {
    emoji: '🚚',
    title: 'Order shipped',
    timelineIcon: 'car-outline',
    color: '#60A5FA',
    timelineLabel: 'Material order shipped',
  },
  order_delivered: {
    emoji: '📦',
    title: 'Order delivered',
    timelineIcon: 'cube-outline',
    color: '#34D399',
    timelineLabel: 'Material order delivered',
  },
  bid_selected: {
    emoji: '✅',
    title: 'Bid selected',
    timelineIcon: 'checkmark-circle-outline',
    color: '#34D399',
    timelineLabel: 'Supplier bid selected',
  },
  bid_rejected: {
    emoji: '📭',
    title: 'Bid not selected',
    timelineIcon: 'close-circle-outline',
    color: '#6B7280',
    timelineLabel: 'Supplier bid not selected',
  },
};

export function fallbackNotificationTitle(type: string) {
  return type.replace(/_/g, ' ');
}

export function notificationDisplayMeta(type: string): NotificationDisplayMeta {
  return META[type] ?? {
    emoji: '🔔',
    title: fallbackNotificationTitle(type),
    timelineIcon: 'notifications-outline',
    color: '#FF6B00',
    timelineLabel: fallbackNotificationTitle(type),
  };
}
