import { notificationDisplayMeta } from '../src/lib/notifications/meta';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('notification display metadata', () => {
  it('uses human-readable labels for newer workflow notifications', () => {
    const notificationScreen = fs.readFileSync(
      path.join(__dirname, '../src/app/notifications.tsx'),
      'utf8',
    );

    expect(notificationDisplayMeta('warranty_expiring').timelineLabel).toBe('Warranty expiring soon');
    expect(notificationDisplayMeta('dispute_raised').timelineLabel).toBe('Dispute opened on a milestone');
    expect(notificationDisplayMeta('order_shipped').title).toBe('Order shipped');
    expect(notificationDisplayMeta('quote_approved').title).toBe('Quote funded');
    expect(notificationDisplayMeta('quote_approved').timelineLabel).toBe('Quote funded in escrow');
    expect(notificationDisplayMeta('gc_approval_requested').title).toBe('GC approval needed');
    expect(notificationDisplayMeta('gc_management_invited').title).toBe('GC management approval needed');
    expect(notificationDisplayMeta('gc_management_invite_received').title).toBe('GC invite received');
    expect(notificationDisplayMeta('gc_management_confirmed').timelineLabel).toBe('GC management is active');
    expect(notificationDisplayMeta('gc_concierge_booking_requested').timelineLabel).toBe('New concierge service request');
    expect(notificationDisplayMeta('gc_concierge_payout_released').title).toBe('Concierge payout released');
    expect(notificationDisplayMeta('gc_trade_negotiation_requested').title).toBe('Quote revision requested');
    expect(notificationScreen).not.toContain("textTransform: 'capitalize'");
  });

  it('falls back to readable text for unknown notification types', () => {
    expect(notificationDisplayMeta('custom_internal_type')).toMatchObject({
      title: 'custom internal type',
      timelineLabel: 'custom internal type',
    });
  });
});
