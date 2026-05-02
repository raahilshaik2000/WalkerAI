import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';

export default function SupplierOrderFeed() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: sup } = await supabase.from('suppliers').select('*').eq('user_id', user.id).single();
    setSupplier(sup);
    if (!sup?.verified) { setLoading(false); return; }

    const { data } = await supabase
      .from('material_orders')
      .select('*, material:materials(*)')
      .eq('status', 'open')
      .order('delivery_deadline', { ascending: true });
    setOrders((data as MaterialOrder[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const claimOrder = async (order: MaterialOrder) => {
    if (!supplier) return;
    setClaiming(order.id);
    try {
      const { error } = await supabase.functions.invoke('claim-material-order', {
        body: { order_id: order.id },
      });
      if (error) throw new Error(error.message);
      await fetchData();
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to claim order';
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

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Open Orders</Text>
          <TouchableOpacity onPress={() => navigation.navigate('SupplierActiveOrders')}>
            <Text style={styles.headerAction}>My Orders →</Text>
          </TouchableOpacity>
        </View>

        {orders.length === 0 ? (
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
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.orderCard}
                onPress={() => navigation.navigate('SupplierOrderDetail', { orderId: item.id })}
                activeOpacity={0.8}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderItem} numberOfLines={1}>{item.material?.item ?? 'Material'}</Text>
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
                  {item.offered_price || item.final_price ? (
                    <Text style={styles.fixedPrice}>
                      ${((item.final_price ?? item.offered_price ?? 0) / 100).toFixed(0)} CAD
                    </Text>
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
            )}
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
});
