import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatCadCents } from '@/lib/currency';
import { formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { joinedMaterialItemName } from '@/lib/material-orders';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { NotificationButton } from '@/components/notifications/NotificationButton';
import { GradientBackground } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';

function supplierCategories(supplier: Supplier): string[] {
  return Array.isArray(supplier.categories) ? supplier.categories : [];
}

function nextSupplierOnboardingRoute(supplier: Supplier | null): string | null {
  if (!supplier) return 'SupplierBusinessOnboarding';
  if (!supplier.license_number) return 'SupplierLicenseOnboarding';
  if (supplierCategories(supplier).length === 0) return 'SupplierCategoriesOnboarding';
  return null;
}

function formatOrderValue(order: MaterialOrder): string | null {
  const price = order.final_price ?? order.offered_price;
  if (price == null) return null;
  return `${formatCadCents(price)} order value`;
}

async function filterClaimableOrders(supplier: Supplier, orders: MaterialOrder[]): Promise<MaterialOrder[]> {
  const categories = supplierCategories(supplier);
  const categoryFiltered = orders.filter((order) => !order.category || categories.includes(order.category));

  if (categoryFiltered.length === 0) return [];

  const checks = await Promise.all(categoryFiltered.map(async (order) => {
    const { data, error } = await supabase.rpc('supplier_can_fulfill_material_order', {
      p_order_id: order.id,
      p_supplier_id: supplier.id,
    });

    if (!error) return data === true ? order : null;

    // Older schemas may not have the radius/category RPC yet. Keep the
    // category-filtered result so old environments still work, while the claim
    // edge function remains the final authority.
    const message = error.message?.toLowerCase() ?? '';
    if (message.includes('supplier_can_fulfill_material_order')
      || message.includes('function')
      || message.includes('schema cache')) {
      return order;
    }

    throw error;
  }));

  return checks.filter((order): order is MaterialOrder => !!order);
}

export default function SupplierOrderFeed() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) {
      setSupplier(null);
      setOrders([]);
      setErrorMessage('You need to be signed in to view supplier orders.');
      setLoading(false);
      return;
    }
    setErrorMessage(null);
    const { data: sup, error: supplierError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (supplierError) {
      setSupplier(null);
      setOrders([]);
      setErrorMessage(supplierError.message);
      setLoading(false);
      return;
    }

    setSupplier(sup);
    if (!sup) {
      setOrders([]);
      setLoading(false);
      return;
    }

    if (!sup?.verified) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('material_orders')
      .select('*, material:materials!material_orders_material_id_fkey(*)')
      .eq('status', 'open')
      .order('delivery_deadline', { ascending: true });

    if (error) {
      setOrders([]);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    try {
      const claimableOrders = await filterClaimableOrders(sup, (data as MaterialOrder[]) ?? []);
      setOrders(claimableOrders);
    } catch (eligibilityError) {
      setOrders([]);
      setErrorMessage(
        eligibilityError instanceof Error
          ? eligibilityError.message
          : 'Could not verify supplier eligibility for open orders.'
      );
    }
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchData();
    });

    return () => subscription.remove();
  }, [fetchData]);

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const claimOrder = async (order: MaterialOrder) => {
    if (!supplier) return;
    setClaiming(order.id);
    try {
      const { error } = await supabase.functions.invoke('claim-material-order', {
        body: { order_id: order.id },
      });
      if (error) throw new Error(await formatSupabaseFunctionError(error));
      await fetchData();
    } catch (err: any) {
      const msg = await formatSupabaseFunctionError(err, 'Failed to claim order');
      if (msg.includes('ORDER_CLAIMED') || msg.includes('no longer available')) {
        Alert.alert('Order taken', 'Another supplier just claimed this order.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setClaiming(null);
    }
  };

  const deadlineLabel = (deadline: string | null) => {
    if (!deadline) return 'No deadline';
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
    if (days < 0) return 'Overdue';
    if (days === 0) return 'Due today';
    return `${days}d left`;
  };

  const tierColor = (tier: string | null) => {
    if (tier === 'luxury') return '#A78BFA';
    if (tier === 'mid-range') return Colors.accent;
    return '#34D399';
  };
  const payoutReady = isStripePayoutLocallyReady(supplier);
  const setupRoute = nextSupplierOnboardingRoute(supplier);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Open Orders</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => navigation.navigate('SupplierActiveOrders')}>
              <Text style={styles.headerAction}>My Orders →</Text>
            </TouchableOpacity>
            <NotificationButton style={styles.notificationButton} />
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Could not load orders</Text>
            <Text style={styles.emptyBody}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchData} activeOpacity={0.8}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : !supplier ? (
          <View style={styles.empty}>
            <Ionicons name="storefront-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Set up your supplier profile</Text>
            <Text style={styles.emptyBody}>Create a supplier profile before claiming material orders.</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => navigation.navigate('SupplierBusinessOnboarding')}
              activeOpacity={0.8}
            >
              <Text style={styles.retryBtnText}>Start Setup</Text>
            </TouchableOpacity>
          </View>
        ) : !supplier.verified ? (
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>{setupRoute ? 'Finish supplier setup' : 'Verification pending'}</Text>
            <Text style={styles.emptyBody}>
              {setupRoute
                ? 'Complete your license and category steps before WalkerAI can review your supplier profile.'
                : 'Open orders appear after your supplier profile is verified.'}
            </Text>
            {setupRoute ? (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => navigation.navigate(setupRoute)}
                activeOpacity={0.8}
              >
                <Text style={styles.retryBtnText}>Continue Setup</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : !payoutReady ? (
          <View style={styles.empty}>
            <Ionicons name="card-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Finish payout setup</Text>
            <Text style={styles.emptyBody}>Stripe payouts must be active before you can claim fixed-price material orders.</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => navigation.navigate('SupplierEarnings')}
              activeOpacity={0.8}
            >
              <Text style={styles.retryBtnText}>Set Up Payouts</Text>
            </TouchableOpacity>
          </View>
        ) : orders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>No open orders</Text>
            <Text style={styles.emptyBody}>New material orders from active projects will appear here.</Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(o) => o.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            renderItem={({ item }) => {
              const orderValue = formatOrderValue(item);
              return (
                <TouchableOpacity
                  style={styles.orderCard}
                  onPress={() => navigation.navigate('SupplierOrderDetail', { orderId: item.id })}
                  activeOpacity={0.8}
                >
                  <View style={styles.orderHeader}>
                    <Text style={styles.orderItem} numberOfLines={1}>{joinedMaterialItemName(item.material)}</Text>
                    <View style={[styles.tierBadge, { backgroundColor: `${tierColor(item.quality_tier)}20` }]}>
                      <Text style={[styles.tierText, { color: tierColor(item.quality_tier) }]}>
                        {item.quality_tier ?? 'any'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.orderQty}>
                    {item.quantity_needed} {item.unit}
                  </Text>

                  <View style={styles.orderFooter}>
                    <View style={styles.deadlineBadge}>
                      <Ionicons name="time-outline" size={13} color={Colors.text.tertiary} />
                      <Text style={styles.deadlineText}>{deadlineLabel(item.delivery_deadline)}</Text>
                    </View>
                    {orderValue ? (
                      <Text style={styles.fixedPrice}>{orderValue}</Text>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.claimBtn, claiming === item.id && styles.claimBtnDisabled]}
                      onPress={() => claimOrder(item)}
                      disabled={claiming === item.id}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.claimBtnText}>
                        {claiming === item.id ? 'Claiming…' : 'Claim Order'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  headerTitle: { ...Typography.h2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  notificationButton: { width: 38, height: 38, borderRadius: 19 },
  headerAction: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: Spacing.xl },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center' },
  orderCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Spacing.md,
    gap: 8,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderItem: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, flex: 1, marginRight: 8 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tierText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  orderQty: { fontSize: 14, color: Colors.text.secondary },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  deadlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deadlineText: { fontSize: 13, color: Colors.text.tertiary },
  fixedPrice: { fontSize: 14, fontWeight: '700', color: '#34D399' },
  claimBtn: { backgroundColor: '#FF6B00', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  claimBtnDisabled: { opacity: 0.5 },
  claimBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },
  retryBtn: { backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },
});
