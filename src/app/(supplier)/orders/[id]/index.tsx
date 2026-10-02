import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { joinedMaterialItemName } from '@/lib/material-orders';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { fetchSupplierProfile, useInvalidateSupplierQueries } from '@/lib/supplier-data';
import { getCurrentUser } from '@/lib/supabase/auth';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { CardSkeleton, GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';

const MANAGEABLE_STATUSES = ['accepted', 'processing', 'shipped'];

const ORDER_DETAIL_SELECT = `
  id, project_id, material_id, status, accepted_supplier_id, category,
  quantity_needed, unit, quality_tier, offered_price, final_price,
  delivery_deadline, tracking_number, carrier, shipped_at, delivered_at,
  confirmed_at, delivery_photo_url, created_at,
  material:materials!material_orders_material_id_fkey(id, item, unit)
`;

function formatCad(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} CAD`;
}

async function checkSupplierCanClaimOrder(supplier: Supplier, order: MaterialOrder): Promise<boolean> {
  const categories = Array.isArray(supplier.categories) ? supplier.categories : [];
  if (order.category && !categories.includes(order.category)) return false;

  const { data, error } = await supabase.rpc('supplier_can_fulfill_material_order', {
    p_order_id: order.id,
    p_supplier_id: supplier.id,
  });

  if (!error) return data === true;

  // Older schemas may not have the radius/category RPC yet. In that case, keep
  // category matching as the UI check and let the edge function make the final
  // server-side decision.
  const message = error.message?.toLowerCase() ?? '';
  if (message.includes('supplier_can_fulfill_material_order')
    || message.includes('function')
    || message.includes('schema cache')) {
    return true;
  }

  throw error;
}

export default function SupplierOrderDetail() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const orderId = getRequiredStringParam(route.params, 'orderId');
  const { user } = useAuthStore();
  const invalidateSupplier = useInvalidateSupplierQueries();
  const [order, setOrder] = useState<MaterialOrder | null>(null);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [canClaimOpenOrder, setCanClaimOpenOrder] = useState(true);
  const hasLoadedRef = useRef(false);

  const fetchOrder = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner || !hasLoadedRef.current) setLoading(true);
    setErrorMessage(null);
    try {
      if (!orderId) {
        setOrder(null);
        setSupplier(null);
        setCanClaimOpenOrder(false);
        setErrorMessage('Order is missing. Reopen it from the order feed.');
        return;
      }
      const currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;
      const [orderResult, fetchedSupplier] = await Promise.all([
        supabase
          .from('material_orders')
          .select(ORDER_DETAIL_SELECT)
          .eq('id', orderId)
          .maybeSingle(),
        currentUserId ? fetchSupplierProfile(currentUserId) : Promise.resolve(null),
      ]);

      if (orderResult.error) {
        setOrder(null);
        setSupplier(null);
        setCanClaimOpenOrder(false);
        setErrorMessage(formatAppSafeErrorMessage(orderResult.error, 'Could not load material order.'));
      } else if (!orderResult.data) {
        setOrder(null);
        setSupplier(null);
        setCanClaimOpenOrder(false);
        setErrorMessage('This order may have been claimed, cancelled, or removed.');
      } else {
        const fetchedOrder = orderResult.data as MaterialOrder;
        setOrder(fetchedOrder);
        setSupplier(fetchedSupplier);

        if (fetchedOrder.status === 'open' && fetchedSupplier?.verified) {
          setCanClaimOpenOrder(await checkSupplierCanClaimOrder(fetchedSupplier, fetchedOrder));
        } else {
          setCanClaimOpenOrder(true);
        }
      }
      hasLoadedRef.current = true;
    } catch (err) {
      if (!hasLoadedRef.current) {
        setOrder(null);
        setSupplier(null);
        setCanClaimOpenOrder(false);
      }
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load material order.'));
    } finally {
      setLoading(false);
    }
  }, [orderId, user?.id]);

  useEffect(() => {
    void fetchOrder({ showSpinner: true });
  }, [fetchOrder]);

  const claimOrder = async () => {
    if (!orderId) {
      Alert.alert('Missing order', 'Reopen it from the order feed and try again.');
      return;
    }
    if (!supplier) {
      Alert.alert('Supplier setup required', 'Create your supplier profile before claiming material orders.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Start Setup', onPress: () => navigation.navigate('SupplierBusinessOnboarding') },
      ]);
      return;
    }
    if (!supplier.verified) {
      Alert.alert('Verification pending', 'Open orders can be claimed after your supplier profile is verified.');
      return;
    }
    if (!canClaimOpenOrder) {
      Alert.alert('Order unavailable', 'This material order is outside your supplier categories or delivery radius.');
      return;
    }
    const payoutReady = isStripePayoutLocallyReady(supplier);
    if (!payoutReady) {
      Alert.alert(
        'Finish payout setup',
        'Stripe payouts must be active before you can claim fixed-price material orders.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Set Up Payouts', onPress: () => navigation.navigate('SupplierTabs', { screen: 'SupplierEarnings' }) },
        ]
      );
      return;
    }

    setClaiming(true);
    try {
      const { error } = await supabase.functions.invoke('claim-material-order', {
        body: { order_id: orderId },
      });
      if (error) throw new Error(await formatSupabaseFunctionError(error));
      invalidateSupplier(user?.id, supplier.id);
      await fetchOrder();
      Alert.alert('Order claimed', 'This order is now in My Orders. Add tracking once it ships.', [
        { text: 'Manage Order', onPress: () => navigation.navigate('SupplierActiveOrders') },
      ]);
    } catch (err) {
      Alert.alert('Could not claim order', await formatSupabaseFunctionError(err, 'Please try again.'));
    } finally {
      setClaiming(false);
    }
  };

  if (loading && !order) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.navTitle}>Order Detail</Text>
            <View style={styles.navSpacer} />
          </View>
          <View style={{ paddingHorizontal: Spacing.md, gap: 12 }}>
            <CardSkeleton />
            <CardSkeleton />
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }
  if (!order) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.navTitle}>Order Detail</Text>
            <View style={styles.navSpacer} />
          </View>
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={44} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Order unavailable</Text>
            <Text style={styles.emptyBody}>
              {errorMessage ?? 'This order may have been claimed, cancelled, or removed.'}
            </Text>
            <GlassButton label="Try Again" onPress={fetchOrder} fullWidth size="md" />
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const orderPrice = order.final_price ?? order.offered_price;
  const orderValue = orderPrice == null ? null : orderPrice;
  const supplierOwnsOrder = !!supplier?.id && order.accepted_supplier_id === supplier.id;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Order Detail</Text>
          <View style={styles.navSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GlassCard style={styles.section} padding={Spacing.md}>
            <Text style={styles.sectionTitle}>Material Needed</Text>
            <Text style={styles.materialName}>{joinedMaterialItemName(order.material)}</Text>
            <View style={styles.row}>
              <DetailItem label="Quantity" value={`${order.quantity_needed} ${order.unit}`} />
              <DetailItem label="Quality" value={order.quality_tier ?? 'Any'} />
            </View>
            {order.delivery_deadline && (
              <DetailItem label="Deliver By" value={new Date(order.delivery_deadline).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })} />
            )}
            {order.delivery_address && (
              <DetailItem label="Delivery Address" value={order.delivery_address} />
            )}
            {order.notes && <DetailItem label="Notes" value={order.notes} />}
          </GlassCard>

          {/* Named Stage Stepper */}
          <GlassCard style={styles.section} padding={Spacing.md}>
            <Text style={styles.sectionTitle}>Order Progress</Text>
            <View style={styles.stepperContainer}>
              {[
                { key: 'claimed', label: 'Claimed', done: ['accepted', 'processing', 'shipped', 'delivered', 'paid'].includes(order.status) },
                { key: 'processing', label: 'Processing', done: ['processing', 'shipped', 'delivered', 'paid'].includes(order.status) },
                { key: 'shipped', label: 'In Transit', done: ['shipped', 'delivered', 'paid'].includes(order.status) },
                { key: 'delivered', label: 'Delivered', done: ['delivered', 'paid'].includes(order.status) },
                { key: 'paid', label: 'Paid', done: order.status === 'paid' },
              ].map((step, idx, arr) => (
                <View key={step.key} style={styles.stepperItem}>
                  <View style={styles.stepperRow}>
                    <View style={[styles.stepDot, step.done && styles.stepDotActive]}>
                      {step.done ? (
                        <Ionicons name="checkmark" size={12} color="#000" />
                      ) : (
                        <Text style={styles.stepNum}>{idx + 1}</Text>
                      )}
                    </View>
                    {idx < arr.length - 1 ? (
                      <View style={[styles.stepLine, arr[idx + 1].done && styles.stepLineActive]} />
                    ) : null}
                  </View>
                  <Text style={[styles.stepLabel, step.done && styles.stepLabelActive]}>{step.label}</Text>
                </View>
              ))}
            </View>
          </GlassCard>

          <GlassCard style={styles.section} padding={Spacing.md}>
            <Text style={styles.sectionTitle}>Fulfillment Details</Text>
            <DetailItem label="Current Status" value={order.status.replace(/_/g, ' ').toUpperCase()} />
            {orderValue != null && (
              <DetailItem
                label="Order Value"
                value={formatCad(orderValue)}
              />
            )}
            {order.tracking_number && <DetailItem label="Tracking" value={order.tracking_number} />}
            {order.carrier && <DetailItem label="Carrier" value={order.carrier} />}
          </GlassCard>

          {order.status === 'paid' && (
            <GlassCard style={styles.paidBanner} padding={Spacing.md}>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              <Text style={styles.paidText}>
                Payment initiated{orderValue != null ? ` for ${formatCad(orderValue)}` : ''} — funds arriving within 2–3 business days
              </Text>
            </GlassCard>
          )}

          {order.status === 'open' && (
            !supplier ? (
              <GlassButton
                label="Set Up Supplier Profile"
                onPress={() => navigation.navigate('SupplierBusinessOnboarding')}
                fullWidth
                size="lg"
                style={styles.deliverBtn}
              />
            ) : !supplier.verified ? (
              <Text style={styles.waitingText}>Supplier verification is required before claiming open orders.</Text>
            ) : !canClaimOpenOrder ? (
              <Text style={styles.waitingText}>This order is outside your supplier categories or delivery radius.</Text>
            ) : !isStripePayoutLocallyReady(supplier) ? (
              <GlassButton
                label="Finish Payout Setup"
                onPress={() => navigation.navigate('SupplierTabs', { screen: 'SupplierEarnings' })}
                fullWidth
                size="lg"
                style={styles.deliverBtn}
              />
            ) : (
              <GlassButton
                label="Claim Order"
                onPress={claimOrder}
                loading={claiming}
                fullWidth
                size="lg"
                style={styles.deliverBtn}
              />
            )
          )}

          {MANAGEABLE_STATUSES.includes(order.status) && (
            <GlassButton
              label="Manage in My Orders"
              onPress={() => navigation.navigate('SupplierActiveOrders')}
              fullWidth
              size="lg"
              style={styles.deliverBtn}
            />
          )}

          {supplierOwnsOrder && order.project_id ? (
            <GlassButton
              label="Project Messages"
              onPress={() => navigation.navigate('SupplierProjectMessages', { id: order.project_id })}
              fullWidth
              size="lg"
              variant="secondary"
              style={styles.deliverBtn}
            />
          ) : null}

          {order.status === 'delivered' && (
            <Text style={styles.waitingText}>Waiting for the homeowner to confirm receipt before payout.</Text>
          )}

          {order.status === 'confirmed' && (
            <Text style={styles.waitingText}>Receipt confirmed. Payout is being processed.</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={diStyles.wrap}>
      <Text style={diStyles.label}>{label}</Text>
      <Text style={diStyles.value}>{value}</Text>
    </View>
  );
}

const diStyles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontSize: 12, color: Colors.text.tertiary, marginBottom: 2 },
  value: { fontSize: 15, color: Colors.text.primary, fontWeight: '500' },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  navTitle: { ...Typography.h3 },
  navSpacer: { width: 22 },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 16 },
  section: {},
  sectionTitle: { fontSize: 13, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  stepperContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8 },
  stepperItem: { flex: 1, alignItems: 'center' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepDotActive: {
    backgroundColor: '#34D399',
  },
  stepNum: { fontSize: 10, fontWeight: '700', color: Colors.text.secondary },
  stepLine: {
    position: 'absolute',
    left: '50%',
    right: '-50%',
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 1,
  },
  stepLineActive: {
    backgroundColor: '#34D399',
  },
  stepLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '500',
  },
  stepLabelActive: {
    color: Colors.text.primary,
    fontWeight: '700',
  },
  materialName: { fontSize: 20, fontWeight: '800', color: Colors.text.primary, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 24 },
  paidBanner: {flexDirection: 'row', alignItems: 'center', gap: 10},
  paidText: { flex: 1, fontSize: 14, color: '#34D399', fontWeight: '500', lineHeight: 20 },
  waitingText: { fontSize: 14, color: Colors.text.tertiary, textAlign: 'center', lineHeight: 20 },
  deliverBtn: { marginTop: 4 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl, gap: 12 },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center', marginBottom: 8 },
});
