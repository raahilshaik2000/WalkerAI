import type { UserRole } from '@/constants/enums';

type NotificationPayload = Record<string, unknown> | null | undefined;

export interface NotificationRoute {
  name: string;
  params?: Record<string, unknown>;
}

const ROOT_ROUTE_BY_ROLE: Partial<Record<UserRole, string>> = {
  homeowner: 'Homeowner',
  company: 'Company',
  supplier: 'Supplier',
  general_contractor: 'GeneralContractor',
};

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function firstDeepLinkMatch(value: unknown, pattern: RegExp): string | undefined {
  const deepLink = stringValue(value);
  if (!deepLink) return undefined;
  const match = deepLink.match(pattern);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function projectIdFromDeepLink(value: unknown): string | undefined {
  return firstDeepLinkMatch(value, /\/(?:project|\(homeowner\)\/project|\(company\)\/job|\(general-contractor\)\/project)\/([^/?#]+)/);
}

function slotIdFromDeepLink(value: unknown): string | undefined {
  return firstDeepLinkMatch(value, /[?&]slot=([^&#]+)/);
}

function orderIdFromDeepLink(value: unknown): string | undefined {
  return firstDeepLinkMatch(value, /\/(?:orders|order)\/([^/?#]+)/);
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
  const projectId = stringValue(payload?.project_id) ?? projectIdFromDeepLink(payload?.deep_link);
  const slotId = stringValue(payload?.slot_id) ?? slotIdFromDeepLink(payload?.deep_link);
  const orderId = stringValue(payload?.order_id) ?? orderIdFromDeepLink(payload?.deep_link);

  if (role === 'supplier') {
    switch (type) {
      case 'new_message':
        return projectId ? { name: 'SupplierProjectMessages', params: { id: projectId } } : { name: 'SupplierTabs' };
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

  if (role === 'general_contractor') {
    if (
      type === 'gc_concierge_booking_requested'
      || type === 'gc_concierge_booking_paid'
      || type === 'gc_concierge_payout_released'
      || type === 'gc_approval_responded'
    ) {
      return { name: 'GeneralContractorTabs', params: { screen: 'GeneralContractorApprovals' } };
    }

    if (!projectId) {
      return { name: 'GeneralContractorTabs', params: { screen: 'GeneralContractorProjects' } };
    }
    switch (type) {
      case 'gc_management_invite_received':
      case 'gc_management_confirmed':
        return { name: 'GeneralContractorProjectDetail', params: { id: projectId } };
      case 'gc_trade_negotiation_responded':
        return { name: 'GeneralContractorTrades', params: { id: projectId } };
      case 'material_order_claimed':
      case 'new_material_order':
      case 'order_shipped':
      case 'order_delivered':
        return { name: 'GeneralContractorMaterials', params: { id: projectId } };
      case 'quote_submitted':
        return { name: 'GeneralContractorTrades', params: { id: projectId } };
      case 'schedule_confirmed':
        return { name: 'GeneralContractorSchedule', params: { id: projectId } };
      case 'milestone_needs_approval':
      case 'dispute_raised':
      case 'quote_approved':
      case 'milestone_paid':
      case 'milestone_completed':
        return { name: 'GeneralContractorPayments', params: { id: projectId } };
      case 'gc_payment_responded':
        return { name: 'GeneralContractorPayments', params: { id: projectId } };
      case 'new_message':
        return { name: 'GeneralContractorMessages', params: { id: projectId } };
      case 'warranty_expiring':
      case 'project_complete':
        return { name: 'GeneralContractorCompletion', params: { id: projectId } };
      case 'gc_approval_requested':
      case 'gc_payment_requested':
        return { name: 'GeneralContractorProjectDetail', params: { id: projectId } };
      default:
        return { name: 'GeneralContractorProjectDetail', params: { id: projectId } };
    }
  }

  if (role === 'company') {
    if (type === 'job_filled') return { name: 'CompanyTabs', params: { screen: 'Jobs' } };
    if (type === 'schedule_confirmed') return { name: 'CompanyTabs', params: { screen: 'Calendar' } };
    if (!projectId) return { name: 'CompanyTabs', params: { screen: 'Jobs' } };

    const slotParams = slotId ? { slot: slotId } : undefined;
    switch (type) {
      case 'job_dispatched':
      case 'slot_dispatched':
      case 'job_accepted':
      case 'slot_accepted':
      case 'gc_trade_negotiation_requested':
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

  if (role !== 'homeowner') return null;
  if (!projectId) return null;

  switch (type) {
    case 'gc_management_invited':
    case 'gc_management_confirmed':
    case 'gc_approval_requested':
    case 'gc_payment_requested':
    case 'gc_concierge_booking_responded':
      return projectDetailRoute('Concierge', projectId);
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
    case 'dispatch_no_match':
      return projectDetailRoute('ProjectDetailMain', projectId);
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

export function toRootNotificationRoute(
  route: NotificationRoute | null,
  role: UserRole | null | undefined,
): NotificationRoute | null {
  if (!route) return null;

  const rootName = role ? ROOT_ROUTE_BY_ROLE[role] : undefined;
  if (!rootName) return null;

  if (route.name === rootName) return route;

  return {
    name: rootName,
    params: {
      screen: route.name,
      params: route.params,
    },
  };
}
