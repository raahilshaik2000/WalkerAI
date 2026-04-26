import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';

export default function SupplierOrderFeed() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bidModal, setBidModal] = useState<MaterialOrder | null>(null);
  const [bidPrice, setBidPrice] = useState('');
  const [bidLeadTime, setBidLeadTime] = useState('');
  const [bidNotes, setBidNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const openBidModal = (order: MaterialOrder) => {
    const estimatedTotal = order.final_price ?? 0;
    setBidPrice(estimatedTotal > 0 ? String((estimatedTotal / 100).toFixed(2)) : '');
    setBidLeadTime('3');
    setBidNotes('');
    setBidModal(order);
  };

  const submitBid = async () => {
    if (!bidModal || !supplier) return;
    const priceTotal = Math.round(parseFloat(bidPrice) * 100);
    const pricePerUnit = bidModal.quantity_needed > 0 ? Math.round(priceTotal / bidModal.quantity_needed) : priceTotal;
    if (isNaN(priceTotal) || priceTotal <= 0) {
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('material_order_bids').upsert({
        order_id: bidModal.id,
        supplier_id: supplier.id,
        price_per_unit: pricePerUnit,
        total_price: priceTotal,
        lead_time_days: parseInt(bidLeadTime, 10) || 3,
        notes: bidNotes.trim() || null,
        status: 'pending',
      }, { onConflict: 'order_id,supplier_id' });
      if (error) throw error;
      setBidModal(null);
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
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
                  <TouchableOpacity style={styles.bidBtn} onPress={() => openBidModal(item)} activeOpacity={0.8}>
                    <Text style={styles.bidBtnText}>Place Bid</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Bid Modal */}
        <Modal visible={!!bidModal} transparent animationType="slide" onRequestClose={() => setBidModal(null)}>
          <Pressable style={styles.overlay} onPress={() => setBidModal(null)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>Place a Bid</Text>
              <Text style={styles.sheetSub}>{bidModal?.material?.item} — {bidModal?.quantity_needed} {bidModal?.unit}</Text>

              <Text style={styles.fieldLabel}>Total Price (CAD $)</Text>
              <TextInput
                style={styles.fieldInput}
                value={bidPrice}
                onChangeText={setBidPrice}
                keyboardType="decimal-pad"
                placeholder="e.g. 1200.00"
                placeholderTextColor={Colors.text.tertiary}
              />

              <Text style={styles.fieldLabel}>Lead Time (days)</Text>
              <TextInput
                style={styles.fieldInput}
                value={bidLeadTime}
                onChangeText={setBidLeadTime}
                keyboardType="numeric"
                placeholder="3"
                placeholderTextColor={Colors.text.tertiary}
              />

              <Text style={styles.fieldLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldMulti]}
                value={bidNotes}
                onChangeText={setBidNotes}
                multiline
                numberOfLines={3}
                placeholder="Brand, model, special notes..."
                placeholderTextColor={Colors.text.tertiary}
              />

              <GlassButton label="Submit Bid" onPress={submitBid} loading={submitting} fullWidth size="lg" style={{ marginTop: Spacing.md }} />
            </Pressable>
          </Pressable>
        </Modal>
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
  bidBtn: { backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  bidBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: Spacing.md },
  sheetTitle: { ...Typography.h2, marginBottom: 4 },
  sheetSub: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  fieldLabel: { fontSize: 13, color: Colors.text.secondary, marginBottom: 6, marginTop: 12 },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    color: Colors.text.primary,
    fontSize: 15,
  },
  fieldMulti: { height: 80, textAlignVertical: 'top' },
});
