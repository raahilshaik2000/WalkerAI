import {
  materialOrderNetPayoutCents,
  materialOrderPaymentStatusLabel,
  materialOrderPlatformFeeCents,
} from '../src/lib/material-orders';

declare const require: (moduleName: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

describe('materialOrderPaymentStatusLabel', () => {
  it('distinguishes confirmed orders from paid orders', () => {
    expect(materialOrderPaymentStatusLabel('confirmed', '$120.00')).toBe('$120.00 confirmed · payout processing');
    expect(materialOrderPaymentStatusLabel('paid', '$120.00')).toBe('$120.00 paid');
  });

  it('leaves non-payment statuses as the amount only', () => {
    expect(materialOrderPaymentStatusLabel('delivered', '$120.00')).toBe('$120.00');
  });
});

describe('supplier material order payout math', () => {
  it('matches the supplier payout edge function platform fee calculation', () => {
    expect(materialOrderPlatformFeeCents(12345, 8)).toBe(988);
    expect(materialOrderNetPayoutCents(12345, 8)).toBe(11357);
  });

  it('does not show negative or invalid payout amounts', () => {
    expect(materialOrderPlatformFeeCents(null, 8)).toBe(0);
    expect(materialOrderNetPayoutCents(null, 8)).toBe(0);
    expect(materialOrderNetPayoutCents(1000, 150)).toBe(0);
  });

  it('keeps supplier order payout screens on exact cent formatting', () => {
    const feedSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/index.tsx'),
      'utf8',
    );
    const activeSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/active.tsx'),
      'utf8',
    );

    expect(feedSource).toContain("import { formatCadCents } from '@/lib/currency'");
    expect(feedSource).toContain('return `${formatCadCents(payout)} payout`;');
    expect(feedSource).not.toContain('maximumFractionDigits: 0');
    expect(activeSource).toContain("import { formatCadCents } from '@/lib/currency'");
    expect(activeSource).toContain('return formatCadCents(cents);');
    expect(activeSource).not.toContain('maximumFractionDigits: 0');
  });

  it('guards supplier fulfillment updates by current status as well as supplier assignment', () => {
    const activeSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/active.tsx'),
      'utf8',
    );

    expect(activeSource).toMatch(
      /\.update\(\{ status: 'processing' \}\)[\s\S]*?\.eq\('id', order\.id\)[\s\S]*?\.eq\('accepted_supplier_id', supplierId\)[\s\S]*?\.eq\('status', 'accepted'\)[\s\S]*?\.select\('id'\)/
    );
    expect(activeSource).toMatch(
      /\.update\(\{ status: 'shipped', tracking_number: tn, carrier: carr \|\| null, shipped_at: new Date\(\)\.toISOString\(\) \}\)[\s\S]*?\.eq\('id', order\.id\)[\s\S]*?\.eq\('accepted_supplier_id', supplierId\)[\s\S]*?\.eq\('status', 'processing'\)[\s\S]*?\.select\('id'\)/
    );
    expect(activeSource).toMatch(
      /\.update\(\{ status: 'delivered', delivered_at: new Date\(\)\.toISOString\(\), delivery_photo_url: photoUrl \}\)[\s\S]*?\.eq\('id', order\.id\)[\s\S]*?\.eq\('accepted_supplier_id', supplierId\)[\s\S]*?\.eq\('status', 'shipped'\)[\s\S]*?\.select\('id'\)/
    );
  });

  it('does not let homeowners release supplier payout without delivery proof', () => {
    const homeownerMaterialsSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(homeowner)/project/[id]/materials.tsx'),
      'utf8',
    );

    expect(homeownerMaterialsSource).toContain("if (!order.delivery_photo_url) {");
    expect(homeownerMaterialsSource).toContain("Alert.alert('Delivery photo missing', 'Ask the supplier to upload delivery proof before releasing payment.');");
    expect(homeownerMaterialsSource).toContain('const hasDeliveryProof = !!order.delivery_photo_url;');
    expect(homeownerMaterialsSource).toContain('Delivery photo proof is missing. Ask the supplier to upload proof before releasing payment.');
    expect(homeownerMaterialsSource).toContain("label={hasDeliveryProof ? 'Confirm Receipt — Release Payment' : 'Awaiting Delivery Proof'}");
    expect(homeownerMaterialsSource).toContain('disabled={!hasDeliveryProof}');
  });
});
