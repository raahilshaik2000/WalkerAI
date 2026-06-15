import { resolveNotificationRoute } from '../src/lib/notifications/navigation';

describe('notification navigation', () => {
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
  });
});
