import { notificationDisplayMeta } from '../src/lib/notifications/meta';

describe('notification display metadata', () => {
  it('uses human-readable labels for newer workflow notifications', () => {
    expect(notificationDisplayMeta('warranty_expiring').timelineLabel).toBe('Warranty expiring soon');
    expect(notificationDisplayMeta('dispute_raised').timelineLabel).toBe('Dispute opened on a milestone');
    expect(notificationDisplayMeta('order_shipped').title).toBe('Order shipped');
    expect(notificationDisplayMeta('gc_approval_requested').title).toBe('GC approval needed');
    expect(notificationDisplayMeta('gc_concierge_booking_requested').timelineLabel).toBe('New concierge service request');
    expect(notificationDisplayMeta('gc_trade_negotiation_requested').title).toBe('Quote revision requested');
  });

  it('falls back to readable text for unknown notification types', () => {
    expect(notificationDisplayMeta('custom_internal_type')).toMatchObject({
      title: 'custom internal type',
      timelineLabel: 'custom internal type',
    });
  });
});
