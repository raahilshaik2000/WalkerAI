import { notificationDisplayMeta } from '../src/lib/notifications/meta';

describe('notification display metadata', () => {
  it('uses human-readable labels for newer workflow notifications', () => {
    expect(notificationDisplayMeta('warranty_expiring').timelineLabel).toBe('Warranty expiring soon');
    expect(notificationDisplayMeta('dispute_raised').timelineLabel).toBe('Dispute opened on a milestone');
    expect(notificationDisplayMeta('order_shipped').title).toBe('Order shipped');
  });

  it('falls back to readable text for unknown notification types', () => {
    expect(notificationDisplayMeta('custom_internal_type')).toMatchObject({
      title: 'custom internal type',
      timelineLabel: 'custom internal type',
    });
  });
});
