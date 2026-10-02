import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { formatCadCents } from '@/lib/currency';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { joinedMaterialItemName } from '@/lib/material-orders';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { NotificationButton } from '@/components/notifications/NotificationButton';
import { GradientBackground, ListItemSkeleton } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';
import { useInvalidateSupplierQueries, useSupplierOpenOrders } from '@/lib/supplier-data';
import { useSilentFocusRefetch } from '@/lib/silent-focus-refetch';
import { supabase } from '@/lib/supabase/client';

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

export default function SupplierOrderFeed() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const invalidateSupplier = useInvalidateSupplierQueries();

  const { profileQuery, ordersQuery, supplier } = useSupplierOpenOrders(user?.id);
  const showSkeleton =
    (!!user?.id && !supplier && profileQuery.isLoading)
    || (!!supplier?.verified && !ordersQuery.data && ordersQuery.isLoading);
  const errorMessage = !user?.id
    ? 'You need to be signed in to view supplier orders.'
    : profileQuery.error
      ? formatAppSafeErrorMessage(profileQuery.error, 'Could not load supplier profile.')
      : ordersQuery.error
        ? formatAppSafeErrorMessage(ordersQuery.error, 'Could not load open material orders.')
        : null;
  const orders = ordersQuery.data ?? [];

  const refetchAll = useCallback(async () => {
    await Promise.all([profileQuery.refetch(), ordersQuery.refetch()]);
  }, [ordersQuery, profileQuery]);
  useSilentFocusRefetch(refetchAll);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchAll();
    setRefreshing(false);
  };

  const claimOrder = async (order: MaterialOrder) => {
    if (!supplier) return;
    setClaiming(order.id);
    try {
      const { error } = await supabase.functions.invoke('claim-material-order', {
        body: { order_id: order.id },
      });
      if (error) throw new Error(await formatSupabaseFunctionError(error));
      invalidateSupplier(user?.id, supplier.id);
      await refetchAll();
    } catch (err: any) {
      const msg = await formatSupabaseFunctionError(err, 'Failed to claim order');
      if (msg.includes('ORDER_CLAIMED') || msg.includes('no longer available')) {
        Alert.alert('Order taken', 'Another supplier just claimed this order.');
      } else {
        Alert.alert('Could not claim order', msg);
      }
      await refetchAll();
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

  if (showSkeleton) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Open Orders</Text>
          </View>
          <View style={styles.skeletonList}>
            {Array.from({ length: 5 }).map((_, index) => (
              <ListItemSkeleton key={`order-skel-${index}`} style={styles.skeletonItem} />
            ))}
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

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
            <TouchableOpacity style={styles.retryBtn} onPress={refetchAll} activeOpacity={0.8}>
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

                  <View style={styles.orderMiddle}>
                    <Text style={styles.orderQty}>
                      {item.quantity_needed} {item.unit}
                    </Text>
                    {orderValue ? (
                      <Text style={styles.fixedPrice}>{orderValue}</Text>
                    ) : null}
                  </View>

                  <View style={styles.orderFooter}>
                    <View style={styles.deadlineBadge}>
                      <Ionicons name="time-outline" size={13} color={Colors.text.tertiary} />
                      <Text style={styles.deadlineText}>{deadlineLabel(item.delivery_deadline)}</Text>
                    </View>
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
  skeletonList: { paddingHorizontal: Spacing.md, paddingTop: 8 },
  skeletonItem: { marginBottom: 12 },
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
    overflow: 'hidden',
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderItem: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, flex: 1, marginRight: 8 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  tierText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  orderMiddle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderQty: { fontSize: 14, color: Colors.text.secondary },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  deadlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deadlineText: { fontSize: 13, color: Colors.text.tertiary },
  fixedPrice: { fontSize: 14, fontWeight: '700', color: '#34D399' },
  claimBtn: { backgroundColor: '#FF6B00', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, alignSelf: 'center' },
  claimBtnDisabled: { opacity: 0.5 },
  claimBtnText: { fontSize: 13, fontWeight: '700', color: '#000' },
  retryBtn: { backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: Colors.accentFg },
});
