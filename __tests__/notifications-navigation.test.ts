import { resolveNotificationRoute, toRootNotificationRoute } from '../src/lib/notifications/navigation';

const fs = require('fs');
const path = require('path');

describe('notification navigation', () => {
  it('keeps shared notification load and read failures app-safe', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/app/notifications.tsx'), 'utf8');

    expect(source).toContain("import { getSession } from '@/lib/supabase/auth';");
    expect(source).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load notifications.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load notifications.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not mark notification as read.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not mark notifications as read.'))");
    expect(source).toContain("setErrorMessage(formatAppSafeErrorMessage(err, 'Could not mark notifications as read.'))");
    expect(source).not.toContain('setErrorMessage(error.message)');
  });

  it('falls back to the active Supabase session for notification loads and bulk read updates', () => {
    const source = fs.readFileSync(path.join(__dirname, '../src/app/notifications.tsx'), 'utf8');
    const button = fs.readFileSync(path.join(__dirname, '../src/components/notifications/NotificationButton.tsx'), 'utf8');

    expect(source).toContain('const currentUserId = user?.id ?? null;');
    expect(source).toContain('const activeUserId = currentUserId ?? (await getSession())?.user?.id ?? null;');
    expect(source).toContain(".eq('user_id', activeUserId)");
    expect(source).toContain("filter: `user_id=eq.${currentUserId}`");
    expect(source).not.toContain(".eq('user_id', user.id)");
    expect(source).not.toContain("filter: `user_id=eq.${user.id}`");

    expect(button).toContain("import { getSession } from '@/lib/supabase/auth';");
    expect(button).toContain('const activeUserId = user?.id ?? (await getSession())?.user?.id ?? null;');
    expect(button).toContain('subscribe().catch(() => {');
    expect(button).toContain(".eq('user_id', activeUserId)");
    expect(button).toContain("filter: `user_id=eq.${activeUserId}`");
    expect(button).toContain('if (!cancelled) setUnreadCount(count ?? 0);');
    expect(button).not.toContain(".eq('user_id', user.id)");
    expect(button).not.toContain("filter: `user_id=eq.${user.id}`");
  });

  it('routes homeowner quote notifications to the quote screen', () => {
    expect(resolveNotificationRoute('quote_submitted', { project_id: 'project-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Quote',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes company slot dispatch notifications with the slot id', () => {
    expect(resolveNotificationRoute('slot_dispatched', { project_id: 'project-1', slot_id: 'slot-1' }, 'company')).toEqual({
      name: 'JobDetail',
      params: {
        screen: 'JobDetailMain',
        params: { id: 'project-1', slot: 'slot-1' },
      },
    });
  });

  it('routes company completion notifications to homeowner review closeout', () => {
    expect(resolveNotificationRoute('project_complete', { project_id: 'project-1' }, 'company')).toEqual({
      name: 'JobDetail',
      params: {
        screen: 'JobReview',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes supplier order payout notifications to earnings', () => {
    expect(resolveNotificationRoute('supplier_paid', { order_id: 'order-1' }, 'supplier')).toEqual({
      name: 'SupplierTabs',
      params: { screen: 'SupplierEarnings' },
    });
  });

  it('routes supplier project message notifications to the shared project thread', () => {
    expect(resolveNotificationRoute('new_message', { project_id: 'project-1' }, 'supplier')).toEqual({
      name: 'SupplierProjectMessages',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('new_message', {}, 'supplier')).toEqual({
      name: 'SupplierTabs',
    });
  });

  it('routes homeowner delivery notifications to project materials', () => {
    expect(resolveNotificationRoute('order_delivered', { project_id: 'project-1', order_id: 'order-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Materials',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes homeowner warranty reminders to warranties', () => {
    expect(resolveNotificationRoute('warranty_expiring', { project_id: 'project-1', days_left: 30 }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Warranties',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes homeowner dispute notifications to milestones', () => {
    expect(resolveNotificationRoute('dispute_raised', { project_id: 'project-1', milestone_id: 'milestone-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Milestones',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes homeowner dispatch miss notifications to the project detail', () => {
    expect(resolveNotificationRoute('dispatch_no_match', { project_id: 'project-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'ProjectDetailMain',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes company shipment notifications to job materials', () => {
    expect(resolveNotificationRoute('order_shipped', { project_id: 'project-1', order_id: 'order-1' }, 'company')).toEqual({
      name: 'JobDetail',
      params: {
        screen: 'JobMaterials',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes company warranty reminders to job warranties', () => {
    expect(resolveNotificationRoute('warranty_expiring', { project_id: 'project-1' }, 'company')).toEqual({
      name: 'JobDetail',
      params: {
        screen: 'JobWarranties',
        params: { id: 'project-1' },
      },
    });
  });

  it('does not route homeowner notifications without a project id', () => {
    expect(resolveNotificationRoute('quote_submitted', {}, 'homeowner')).toBeNull();
  });

  it('routes homeowner GC workflow notifications to concierge controls', () => {
    expect(resolveNotificationRoute('gc_management_invited', { project_id: 'project-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Concierge',
        params: { id: 'project-1' },
      },
    });

    expect(resolveNotificationRoute('gc_approval_requested', { project_id: 'project-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Concierge',
        params: { id: 'project-1' },
      },
    });

    expect(resolveNotificationRoute('gc_payment_requested', { project_id: 'project-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Concierge',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes GC response notifications to the approvals inbox', () => {
    expect(resolveNotificationRoute('gc_concierge_booking_requested', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorTabs',
      params: { screen: 'GeneralContractorApprovals' },
    });

    expect(resolveNotificationRoute('gc_approval_responded', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorTabs',
      params: { screen: 'GeneralContractorApprovals' },
    });

    expect(resolveNotificationRoute('gc_concierge_payout_released', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorTabs',
      params: { screen: 'GeneralContractorApprovals' },
    });
  });

  it('routes GC assignment lifecycle notifications to project management surfaces', () => {
    expect(resolveNotificationRoute('gc_management_invite_received', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorProjectDetail',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('gc_management_confirmed', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorProjectDetail',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('gc_management_confirmed', { project_id: 'project-1' }, 'homeowner')).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Concierge',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes GC trade negotiation notifications to the right role surface', () => {
    expect(resolveNotificationRoute('gc_trade_negotiation_requested', { project_id: 'project-1', slot_id: 'slot-1' }, 'company')).toEqual({
      name: 'JobDetail',
      params: {
        screen: 'JobDetailMain',
        params: { id: 'project-1', slot: 'slot-1' },
      },
    });

    expect(resolveNotificationRoute('gc_trade_negotiation_responded', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorTrades',
      params: { id: 'project-1' },
    });
  });

  it('routes GC material notifications to managed project materials', () => {
    expect(resolveNotificationRoute('material_order_claimed', { project_id: 'project-1', order_id: 'order-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorMaterials',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('order_delivered', { project_id: 'project-1', order_id: 'order-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorMaterials',
      params: { id: 'project-1' },
    });
  });

  it('falls back to WalkerAI deep links when GC push payload ids are missing', () => {
    expect(resolveNotificationRoute(
      'new_message',
      { deep_link: '/project/project-1/messages' },
      'supplier',
    )).toEqual({
      name: 'SupplierProjectMessages',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute(
      'order_delivered',
      { deep_link: '/(general-contractor)/project/project-1/materials' },
      'general_contractor',
    )).toEqual({
      name: 'GeneralContractorMaterials',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute(
      'gc_trade_negotiation_requested',
      { deep_link: '/(company)/job/project-1?slot=slot-1' },
      'company',
    )).toEqual({
      name: 'JobDetail',
      params: {
        screen: 'JobDetailMain',
        params: { id: 'project-1', slot: 'slot-1' },
      },
    });

    expect(resolveNotificationRoute(
      'gc_management_invited',
      { deep_link: '/(homeowner)/project/project-1/concierge' },
      'homeowner',
    )).toEqual({
      name: 'ProjectDetail',
      params: {
        screen: 'Concierge',
        params: { id: 'project-1' },
      },
    });
  });

  it('routes GC project workflow notifications to dedicated management screens', () => {
    expect(resolveNotificationRoute('quote_submitted', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorTrades',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('schedule_confirmed', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorSchedule',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('milestone_needs_approval', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorPayments',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('gc_payment_responded', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorPayments',
      params: { id: 'project-1' },
    });

    expect(resolveNotificationRoute('project_complete', { project_id: 'project-1' }, 'general_contractor')).toEqual({
      name: 'GeneralContractorCompletion',
      params: { id: 'project-1' },
    });
  });

  it('wraps local notification routes for root-level push deep links', () => {
    const gcRoute = resolveNotificationRoute('gc_trade_negotiation_responded', { project_id: 'project-1' }, 'general_contractor');
    expect(toRootNotificationRoute(gcRoute, 'general_contractor')).toEqual({
      name: 'GeneralContractor',
      params: {
        screen: 'GeneralContractorTrades',
        params: { id: 'project-1' },
      },
    });

    const homeownerRoute = resolveNotificationRoute('quote_submitted', { project_id: 'project-1' }, 'homeowner');
    expect(toRootNotificationRoute(homeownerRoute, 'homeowner')).toEqual({
      name: 'Homeowner',
      params: {
        screen: 'ProjectDetail',
        params: {
          screen: 'Quote',
          params: { id: 'project-1' },
        },
      },
    });

    const companyRoute = resolveNotificationRoute('gc_trade_negotiation_requested', { project_id: 'project-1', slot_id: 'slot-1' }, 'company');
    expect(toRootNotificationRoute(companyRoute, 'company')).toEqual({
      name: 'Company',
      params: {
        screen: 'JobDetail',
        params: {
          screen: 'JobDetailMain',
          params: { id: 'project-1', slot: 'slot-1' },
        },
      },
    });

    const supplierRoute = resolveNotificationRoute('new_message', { project_id: 'project-1' }, 'supplier');
    expect(toRootNotificationRoute(supplierRoute, 'supplier')).toEqual({
      name: 'Supplier',
      params: {
        screen: 'SupplierProjectMessages',
        params: { id: 'project-1' },
      },
    });
  });

  it('does not route unsupported internal roles into public app stacks', () => {
    expect(resolveNotificationRoute('job_dispatched', { project_id: 'project-1' }, 'admin')).toBeNull();
    expect(resolveNotificationRoute('quote_submitted', { project_id: 'project-1' }, null)).toBeNull();

    const companyRoute = resolveNotificationRoute('job_dispatched', { project_id: 'project-1' }, 'company');
    expect(toRootNotificationRoute(companyRoute, 'admin')).toBeNull();
  });

  it('keeps push tap role state in sync after auth role hydration', () => {
    const rootNavigator = fs.readFileSync(
      path.join(__dirname, '../src/navigation/RootNavigator.tsx'),
      'utf8',
    );
    const pushModule = fs.readFileSync(
      path.join(__dirname, '../src/lib/push/index.ts'),
      'utf8',
    );

    expect(pushModule).toContain('export function setPushCurrentRole(role: UserRole | null)');
    expect(rootNavigator).toContain('setPushCurrentRole(role);');
    expect(rootNavigator.indexOf('setPushCurrentRole(role);')).toBeLessThan(
      rootNavigator.indexOf('const currentUserId = session?.user?.id ?? null;'),
    );
  });

  it('keeps push tap handling aligned with canonical APNs payload ids', () => {
    const pushModule = fs.readFileSync(
      path.join(__dirname, '../src/lib/push/index.ts'),
      'utf8',
    );
    const sendPushFunction = fs.readFileSync(
      path.join(__dirname, '../supabase/functions/send-push/index.ts'),
      'utf8',
    );

    expect(sendPushFunction).toContain('type,');
    expect(sendPushFunction).toContain('...payload,');
    expect(pushModule).toContain('canonical project_id/slot_id/order_id keys');
    expect(pushModule).not.toContain('related_project_id');
    expect(pushModule).not.toContain('related_slot_id');
    expect(pushModule).not.toContain('related_order_id');
  });
});
