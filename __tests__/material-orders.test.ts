import {
  joinedMaterialItemName,
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
  it('reads material names from object or array joins', () => {
    expect(joinedMaterialItemName({ item: 'Porcelain floor tile' })).toBe('Porcelain floor tile');
    expect(joinedMaterialItemName([{ item: 'Waterproof vinyl plank' }])).toBe('Waterproof vinyl plank');
    expect(joinedMaterialItemName([{ item: '   ' }])).toBe('Material');
    expect(joinedMaterialItemName(null)).toBe('Material');
  });

  it('matches the supplier payout edge function platform fee calculation', () => {
    expect(materialOrderPlatformFeeCents(12345, 8)).toBe(988);
    expect(materialOrderNetPayoutCents(12345, 8)).toBe(11357);
  });

  it('does not show negative or invalid payout amounts', () => {
    expect(materialOrderPlatformFeeCents(null, 8)).toBe(0);
    expect(materialOrderNetPayoutCents(null, 8)).toBe(0);
    expect(materialOrderNetPayoutCents(1000, 150)).toBe(0);
  });

  it('keeps supplier order value screens on exact cent formatting', () => {
    const feedSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/index.tsx'),
      'utf8',
    );
    const activeSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/active.tsx'),
      'utf8',
    );

    expect(feedSource).toContain("import { formatCadCents } from '@/lib/currency'");
    expect(feedSource).toContain('return `${formatCadCents(price)} order value`;');
    expect(feedSource).not.toContain('maximumFractionDigits: 0');
    expect(activeSource).toContain("import { formatCadCents } from '@/lib/currency'");
    expect(activeSource).toContain('return formatCadCents(cents);');
    expect(activeSource).not.toContain('maximumFractionDigits: 0');
  });

  it('does not disclose supplier platform fee or net payout math in app UI', () => {
    const feedSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/index.tsx'),
      'utf8',
    );
    const earningsSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/earnings/index.tsx'),
      'utf8',
    );
    const activeSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/active.tsx'),
      'utf8',
    );
    const detailSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/[id]/index.tsx'),
      'utf8',
    );

    [feedSource, earningsSource, activeSource, detailSource].forEach((source) => {
      expect(source).not.toContain('materialOrderNetPayoutCents');
      expect(source).not.toContain('platform_fee_pct');
      expect(source).not.toContain('Platform fees deducted');
      expect(source).not.toContain(' gross');
      expect(source).not.toContain('net payout');
      expect(source).not.toContain('Net Earned');
      expect(source).not.toContain('Pending Net');
      expect(source).not.toContain('Supplier Payout');
      expect(source).not.toContain('Estimated Supplier Payout');
    });
  });

  it('uses joined material name normalization on supplier material order screens', () => {
    const supplierOrderSources = [
      '../src/app/(supplier)/orders/index.tsx',
      '../src/app/(supplier)/orders/active.tsx',
      '../src/app/(supplier)/orders/[id]/index.tsx',
      '../src/app/(supplier)/earnings/index.tsx',
    ].map((sourcePath) => fs.readFileSync(path.join(__dirname, sourcePath), 'utf8'));

    supplierOrderSources.forEach((source) => {
      expect(source).toContain("joinedMaterialItemName");
      expect(source).not.toContain("material?.item ?? 'Material'");
      expect(source).not.toContain("(order.material as any)?.item ?? 'Material'");
    });
  });

  it('keeps supplier material order feed, detail, and fulfillment errors app-safe', () => {
    const feedSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/index.tsx'),
      'utf8',
    );
    const detailSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/[id]/index.tsx'),
      'utf8',
    );
    const activeSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(supplier)/orders/active.tsx'),
      'utf8',
    );

    expect(feedSource).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions'");
    expect(feedSource).toContain("setErrorMessage(formatAppSafeErrorMessage(supplierError, 'Could not load supplier profile.'))");
    expect(feedSource).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load open material orders.'))");
    expect(feedSource).toContain("setErrorMessage(formatAppSafeErrorMessage(eligibilityError, 'Could not verify supplier eligibility for open orders.'))");
    expect(feedSource).not.toContain('setErrorMessage(supplierError.message)');
    expect(feedSource).not.toContain('setErrorMessage(error.message)');
    expect(feedSource).not.toContain('eligibilityError instanceof Error');

    expect(detailSource).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions'");
    expect(detailSource).toContain("setErrorMessage(formatAppSafeErrorMessage(orderResult.error, 'Could not load material order.'))");
    expect(detailSource).toContain("setErrorMessage(formatAppSafeErrorMessage(supplierResult.error, 'Could not load supplier profile.'))");
    expect(detailSource).toContain("setErrorMessage(formatAppSafeErrorMessage(eligibilityError, 'Could not verify supplier eligibility for this order.'))");
    expect(detailSource).toContain("Alert.alert('Could not claim order', await formatSupabaseFunctionError(err, 'Please try again.'))");
    expect(detailSource).not.toContain('setErrorMessage(orderResult.error.message)');
    expect(detailSource).not.toContain('setErrorMessage(supplierResult.error.message)');
    expect(detailSource).not.toContain('eligibilityError instanceof Error');
    expect(detailSource).not.toContain("Alert.alert('Error', await formatSupabaseFunctionError(err, 'Failed to claim order.'))");

    expect(activeSource).toContain("import { formatAppSafeErrorMessage } from '@/lib/supabase/functions'");
    expect(activeSource).toContain("setErrorMessage(formatAppSafeErrorMessage(supplierError, 'Could not load supplier profile.'))");
    expect(activeSource).toContain("setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load active supplier orders.'))");
    expect(activeSource).toContain("Alert.alert('Could not update order', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(activeSource).toContain("Alert.alert('Could not mark order shipped', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(activeSource).toContain("Alert.alert('Could not mark order delivered', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(activeSource).not.toContain('setErrorMessage(supplierError.message)');
    expect(activeSource).not.toContain('setErrorMessage(error.message)');
    expect(activeSource).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update order.')");
    expect(activeSource).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to mark order shipped.')");
    expect(activeSource).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to mark order delivered.')");
  });

  it('uses explicit material relationship names on company supplier-delivery queries', () => {
    const companyMaterialsSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/materials.tsx'),
      'utf8',
    );

    expect(companyMaterialsSource).toContain('material:materials!material_orders_material_id_fkey(item)');
    expect(companyMaterialsSource).not.toContain('material:materials(item)');
  });

  it('keeps company material verification errors app-safe for GC-managed material workflows', () => {
    const companyMaterialsSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/materials.tsx'),
      'utf8',
    );

    expect(companyMaterialsSource).toContain("import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions'");
    expect(companyMaterialsSource).toContain("Alert.alert('Could not load materials', formatAppSafeErrorMessage(materialsResult.error, 'Please try again.'))");
    expect(companyMaterialsSource).toContain("Alert.alert('Could not load supplier orders', formatAppSafeErrorMessage(ordersResult.error, 'Please try again.'))");
    expect(companyMaterialsSource).toContain("Alert.alert('Could not load supplier reviews', formatAppSafeErrorMessage(reviewsError, 'Please try again.'))");
    expect(companyMaterialsSource).toContain("throw new Error(formatAppSafeErrorMessage(error, `Could not save ${m.item}.`))");
    expect(companyMaterialsSource).toContain("throw new Error(formatAppSafeErrorMessage(orderError, `Could not load ${m.item} order.`))");
    expect(companyMaterialsSource).toContain("throw new Error(formatAppSafeErrorMessage(error, `Could not sync ${m.item} order.`))");
    expect(companyMaterialsSource).toContain("Alert.alert('Could not save quantities', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(companyMaterialsSource).toContain("Alert.alert('Could not submit supplier review', formatAppSafeErrorMessage(err, 'Please try again.'))");
    expect(companyMaterialsSource).not.toContain("Alert.alert('Error', materialsResult.error.message)");
    expect(companyMaterialsSource).not.toContain("Alert.alert('Error', ordersResult.error.message)");
    expect(companyMaterialsSource).not.toContain("Alert.alert('Error', reviewsError.message)");
    expect(companyMaterialsSource).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save quantities.')");
    expect(companyMaterialsSource).not.toContain("Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit supplier review.')");
  });

  it('scopes company material verification writes to the current project', () => {
    const companyMaterialsSource = fs.readFileSync(
      path.join(__dirname, '../src/app/(company)/job/[id]/materials.tsx'),
      'utf8',
    );

    expect(companyMaterialsSource).toMatch(
      /\.from\('materials'\)[\s\S]*?\.update\(\{[\s\S]*?verified_quantity: qty,[\s\S]*?verified_by: user\.id,[\s\S]*?verified_at: verifiedAt,[\s\S]*?\}\)[\s\S]*?\.eq\('id', m\.id\)[\s\S]*?\.eq\('project_id', projectId\)[\s\S]*?\.select\('id'\)/
    );
    expect(companyMaterialsSource).toMatch(
      /\.from\('material_orders'\)[\s\S]*?\.select\('id, status'\)[\s\S]*?\.eq\('material_id', m\.id\)[\s\S]*?\.eq\('project_id', projectId\)[\s\S]*?\.eq\('status', 'open'\)/
    );
    expect(companyMaterialsSource).toMatch(
      /\.from\('material_orders'\)[\s\S]*?\.update\(\{ quantity_needed: qty \}\)[\s\S]*?\.eq\('id', order\.id\)[\s\S]*?\.eq\('project_id', projectId\)/
    );
  });

  it('allows suppliers to read material rows only through eligible or accepted material orders', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260616052440_allow_supplier_material_order_material_reads.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE POLICY "materials_supplier_order_select" ON public.materials');
    expect(migration).toContain('mo.material_id = materials.id');
    expect(migration).toContain("mo.status = 'open'");
    expect(migration).toContain('public.supplier_can_fulfill_material_order(mo.id, s.id)');
    expect(migration).toContain('mo.accepted_supplier_id IN');
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

  it('notifies active GC managers when supplier material orders ship or are delivered', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260616024000_notify_gc_material_fulfillment.sql'),
      'utf8',
    );

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.notify_material_order_fulfillment_update()');
    expect(migration).toContain("OLD.status = 'processing' AND NEW.status = 'shipped'");
    expect(migration).toContain("OLD.status = 'shipped' AND NEW.status = 'delivered'");
    expect(migration).toContain('JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id');
    expect(migration).toContain("gcp.status = 'active'");
    expect(migration).toContain("gc.user_id <> v_project.homeowner_id");
    expect(migration).toContain("COALESCE(v_company_user_ids, ARRAY[]::uuid[])");
    expect(migration).toContain("'/(general-contractor)/project/' || NEW.project_id || '/materials'");
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
