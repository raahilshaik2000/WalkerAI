import type { UserRole } from '@/constants/enums';

type NotificationPayload = Record<string, unknown> | null | undefined;

export interface NotificationRoute {
  name: string;
  params?: Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function projectDetailRoute(screen: string, projectId: string, extraParams?: Record<string, unknown>): NotificationRoute {
  return {
    name: 'ProjectDetail',
    params: {
      screen,
      params: { id: projectId, ...extraParams },
    },
  };
}

function jobDetailRoute(screen: string, projectId: string, extraParams?: Record<string, unknown>): NotificationRoute {
  return {
    name: 'JobDetail',
    params: {
      screen,
      params: { id: projectId, ...extraParams },
    },
  };
}

export function resolveNotificationRoute(
  type: string,
  payload: NotificationPayload,
  role: UserRole | null | undefined,
): NotificationRoute | null {
  const projectId = stringValue(payload?.project_id);
  const slotId = stringValue(payload?.slot_id);
  const orderId = stringValue(payload?.order_id);

  if (role === 'supplier') {
    switch (type) {
      case 'new_material_order':
        return { name: 'SupplierTabs', params: { screen: 'SupplierOrders' } };
      case 'supplier_paid':
        return { name: 'SupplierTabs', params: { screen: 'SupplierEarnings' } };
      case 'order_shipped':
      case 'order_delivered':
      case 'bid_selected':
      case 'bid_rejected':
        return orderId ? { name: 'SupplierOrderDetail', params: { orderId } } : { name: 'SupplierActiveOrders' };
      default:
        return orderId ? { name: 'SupplierOrderDetail', params: { orderId } } : { name: 'SupplierTabs' };
    }
  }

  if (role === 'company' || role === 'admin') {
    if (type === 'job_filled') return { name: 'CompanyTabs', params: { screen: 'Jobs' } };
    if (type === 'schedule_confirmed') return { name: 'CompanyTabs', params: { screen: 'Calendar' } };
    if (!projectId) return { name: 'CompanyTabs', params: { screen: 'Jobs' } };

    const slotParams = slotId ? { slot: slotId } : undefined;
    switch (type) {
      case 'job_dispatched':
      case 'slot_dispatched':
      case 'job_accepted':
      case 'slot_accepted':
        return jobDetailRoute('JobDetailMain', projectId, slotParams);
      case 'quote_approved':
      case 'milestone_paid':
      case 'milestone_needs_approval':
      case 'milestone_completed':
      case 'dispute_raised':
        return jobDetailRoute('JobMilestones', projectId, slotParams);
      case 'material_order_claimed':
      case 'new_material_order':
      case 'order_shipped':
      case 'order_delivered':
        return jobDetailRoute('JobMaterials', projectId, slotParams);
      case 'warranty_expiring':
        return jobDetailRoute('JobWarranties', projectId, slotParams);
      case 'new_message':
        return jobDetailRoute('JobMessages', projectId, slotParams);
      case 'project_complete':
        return jobDetailRoute('JobReview', projectId, slotParams);
      default:
        return jobDetailRoute('JobDetailMain', projectId, slotParams);
    }
  }

  if (!projectId) return null;

  switch (type) {
    case 'quote_submitted':
      return projectDetailRoute('Quote', projectId);
    case 'quote_approved':
    case 'milestone_needs_approval':
    case 'milestone_paid':
    case 'milestone_completed':
      return projectDetailRoute('Milestones', projectId);
    case 'dispute_raised':
      return projectDetailRoute('Milestones', projectId);
    case 'all_slots_filled':
    case 'schedule_confirmed':
      return projectDetailRoute('ProjectSchedule', projectId);
    case 'material_order_claimed':
    case 'new_material_order':
    case 'order_shipped':
    case 'order_delivered':
      return projectDetailRoute('Materials', projectId);
    case 'warranty_expiring':
      return projectDetailRoute('Warranties', projectId);
    case 'new_message':
      return projectDetailRoute('Messages', projectId);
    case 'project_complete':
      return projectDetailRoute('Review', projectId);
    default:
      return projectDetailRoute('ProjectDetailMain', projectId);
  }
}

export function navigateToNotification(
  navigation: { navigate: (name: string, params?: Record<string, unknown>) => void },
  type: string,
  payload: NotificationPayload,
  role: UserRole | null | undefined,
): boolean {
  const route = resolveNotificationRoute(type, payload, role);
  if (!route) return false;
  navigation.navigate(route.name, route.params);
  return true;
}
