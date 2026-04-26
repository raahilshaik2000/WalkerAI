import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, ListItemSkeleton } from '@/components/ui';

interface BidSupplier {
  id: string;
  user_id: string;
  business_name: string;
  rating: number | null;
  fulfillment_rate: number | null;
}

interface Bid {
  id: string;
  price_per_unit: number;
  total_price: number;
  lead_time_days: number | null;
  notes: string | null;
  status: 'pending' | 'selected' | 'rejected';
  submitted_at: string;
  supplier: BidSupplier | null;
}

interface MaterialOrder {
  id: string;
  status: string;
  quantity_needed: number;
  unit: string;
  quality_tier: string | null;
  final_price: number | null;
  delivery_deadline: string | null;
  tracking_number: string | null;
  carrier: string | null;
  delivery_photo_url: string | null;
  material: { item: string; quantity: number | null; unit: string | null; quality_tier: string | null } | null;
  bids: Bid[];
  accepted_supplier: { business_name: string; rating: number | null } | null;
}

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
}

function daysLeft(deadline: string | null): string {
  if (!deadline) return '';
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Due today';
  return `${diff}d left`;
}

const TIMELINE_STEPS = ['Accepted', 'Processing', 'Shipped', 'Delivered'];
const TIMELINE_KEYS = ['accepted', 'processing', 'shipped', 'delivered'];

export default function MaterialsScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();

  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingBid, setSelectingBid] = useState<string | null>(null);
  const [confirmingOrder, setConfirmingOrder] = useState<string | null>(null);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('material_orders')
      .select(`
        id, status, quantity_needed, unit, quality_tier, final_price,
        delivery_deadline, tracking_number, carrier, delivery_photo_url,
        material:materials(item, quantity, unit, quality_tier),
        bids:material_order_bids(
          id, price_per_unit, total_price, lead_time_days, notes, status, submitted_at,
          supplier:suppliers(id, user_id, business_name, rating, fulfillment_rate)
        ),
        accepted_supplier:suppliers!accepted_supplier_id(business_name, rating)
      `)
      .eq('project_id', projectId)
      .order('created_at');
    setOrders((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel(`material_orders:${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_orders' }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  const selectBid = async (order: MaterialOrder, bid: Bid) => {
    Alert.alert(
      'Select this supplier?',
      `${bid.supplier?.business_name ?? 'Supplier'} will fulfill this order for ${formatCad(bid.total_price)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setSelectingBid(bid.id);
            try {
              const loserIds = order.bids.filter((b) => b.id !== bid.id).map((b) => b.id);

              if (loserIds.length > 0) {
                await supabase.from('material_order_bids').update({ status: 'rejected' }).in('id', loserIds);
              }
              await supabase.from('material_order_bids').update({ status: 'selected' }).eq('id', bid.id);
              await supabase
                .from('material_orders')
                .update({ status: 'accepted', accepted_supplier_id: bid.supplier?.id, final_price: bid.total_price })
                .eq('id', order.id);

              // Notify suppliers (best-effort, non-blocking)
              try {
                if (bid.supplier?.user_id) {
                  await supabase.from('notifications').insert({
                    user_id: bid.supplier.user_id,
                    type: 'bid_selected',
                    payload: { order_id: order.id },
                  });
                }
                for (const loserId of loserIds) {
                  const loser = order.bids.find((b) => b.id === loserId);
                  if (loser?.supplier?.user_id) {
                    await supabase.from('notifications').insert({
                      user_id: loser.supplier.user_id,
                      type: 'bid_rejected',
                      payload: { order_id: order.id },
                    });
                  }
                }
              } catch (_) {}

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              await fetchOrders();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to select supplier.');
            } finally {
              setSelectingBid(null);
            }
          },
        },
      ]
    );
  };

  const confirmDelivery = async (order: MaterialOrder) => {
    Alert.alert(
      'Confirm receipt?',
      'This will release payment to the supplier. Make sure your materials have arrived and are correct.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Release Payment',
          style: 'destructive',
          onPress: async () => {
            setConfirmingOrder(order.id);
            try {
              await supabase
                .from('material_orders')
                .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
                .eq('id', order.id);

              const { error } = await supabase.functions.invoke('supplier-payout', {
                body: { order_id: order.id },
              });
              if (error) throw error;

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              await fetchOrders();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to release payment.');
            } finally {
              setConfirmingOrder(null);
            }
          },
        },
      ]
    );
  };

  const awaitingBids = orders.filter((o) => o.status === 'open' && o.bids.length === 0);
  const hasBids = orders.filter((o) => o.status === 'open' && o.bids.length > 0);
  const inProgress = orders.filter((o) => ['accepted', 'processing', 'shipped'].includes(o.status));
  const needsConfirmation = orders.filter((o) => o.status === 'delivered');
  const completed = orders.filter((o) => ['confirmed', 'paid'].includes(o.status));

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.backText} onPress={() => navigation.goBack()}>← Back</Text>
            <Text style={styles.title}>Materials</Text>
          </View>

          {loading && Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} style={{ marginBottom: 10 }} />)}

          {!loading && orders.length === 0 && (
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No material orders yet</Text>
              <Text style={styles.emptyBody}>
                They'll appear here once your project is active and a contractor quote has been approved.
              </Text>
            </GlassCard>
          )}

          {awaitingBids.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Finding Suppliers</Text>
              {awaitingBids.map((order) => (
                <GlassCard key={order.id} style={styles.orderCard}>
                  <View style={styles.orderTopRow}>
                    <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>Searching...</Text>
                    </View>
                  </View>
                  <Text style={styles.orderMeta}>
                    {order.quantity_needed} {order.unit}
                    {order.quality_tier ? ` · ${order.quality_tier}` : ''}
                    {order.delivery_deadline ? ` · ${daysLeft(order.delivery_deadline)}` : ''}
                  </Text>
                </GlassCard>
              ))}
            </>
          )}

          {hasBids.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Choose a Supplier</Text>
              {hasBids.map((order) => (
                <GlassCard key={order.id} style={styles.orderCard}>
                  <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                  <Text style={styles.orderMeta}>
                    {order.quantity_needed} {order.unit}
                    {order.quality_tier ? ` · ${order.quality_tier}` : ''}
                    {order.delivery_deadline ? ` · ${daysLeft(order.delivery_deadline)}` : ''}
                  </Text>
                  <View style={styles.bidsContainer}>
                    {order.bids
                      .filter((b) => b.status === 'pending')
                      .sort((a, b) => a.total_price - b.total_price)
                      .map((bid, i) => (
                        <View key={bid.id} style={[styles.bidRow, i === 0 && styles.bidRowBest]}>
                          <View style={styles.bidInfo}>
                            <Text style={styles.bidSupplier}>
                              {bid.supplier?.business_name ?? 'Supplier'}
                              {i === 0 ? ' 🏅' : ''}
                            </Text>
                            {bid.supplier?.rating != null && (
                              <Text style={styles.bidMeta}>⭐ {bid.supplier.rating.toFixed(1)}</Text>
                            )}
                            {bid.lead_time_days != null && (
                              <Text style={styles.bidMeta}>{bid.lead_time_days}d delivery</Text>
                            )}
                            {bid.notes ? <Text style={styles.bidNotes}>{bid.notes}</Text> : null}
                          </View>
                          <View style={styles.bidRight}>
                            <Text style={styles.bidPrice}>{formatCad(bid.total_price)}</Text>
                            <TouchableOpacity
                              style={[styles.selectBtn, !!selectingBid && styles.selectBtnDisabled]}
                              onPress={() => selectBid(order, bid)}
                              disabled={!!selectingBid}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.selectBtnText}>
                                {selectingBid === bid.id ? '...' : 'Select'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                  </View>
                </GlassCard>
              ))}
            </>
          )}

          {inProgress.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>In Progress</Text>
              {inProgress.map((order) => {
                const stepIdx = TIMELINE_KEYS.indexOf(order.status);
                return (
                  <GlassCard key={order.id} style={styles.orderCard}>
                    <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                    {order.accepted_supplier && (
                      <Text style={styles.orderMeta}>
                        {order.accepted_supplier.business_name}
                        {order.accepted_supplier.rating != null
                          ? ` · ⭐ ${order.accepted_supplier.rating.toFixed(1)}`
                          : ''}
                      </Text>
                    )}
                    <View style={styles.timeline}>
                      {TIMELINE_STEPS.map((label, i) => (
                        <View key={label} style={styles.timelineStep}>
                          <View style={styles.timelineStepInner}>
                            <View style={[styles.timelineDot, i <= stepIdx && styles.timelineDotActive]}>
                              {i <= stepIdx && <Text style={styles.timelineDotCheck}>✓</Text>}
                            </View>
                            {i < TIMELINE_STEPS.length - 1 && (
                              <View style={[styles.timelineLine, i < stepIdx && styles.timelineLineActive]} />
                            )}
                          </View>
                          <Text style={[styles.timelineLabel, i <= stepIdx && styles.timelineLabelActive]}>
                            {label}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {order.tracking_number && (
                      <View style={styles.trackingBox}>
                        <Text style={styles.trackingLabel}>Tracking</Text>
                        <Text style={styles.trackingValue}>
                          {order.carrier ? `${order.carrier}  ` : ''}{order.tracking_number}
                        </Text>
                      </View>
                    )}
                  </GlassCard>
                );
              })}
            </>
          )}

          {needsConfirmation.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Confirm Receipt</Text>
              {needsConfirmation.map((order) => (
                <GlassCard key={order.id} style={styles.orderCard}>
                  <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                  {order.accepted_supplier && (
                    <Text style={styles.orderMeta}>From {order.accepted_supplier.business_name}</Text>
                  )}
                  {order.delivery_photo_url && (
                    <Image
                      source={{ uri: order.delivery_photo_url }}
                      style={styles.deliveryPhoto}
                      resizeMode="cover"
                    />
                  )}
                  {order.final_price != null && (
                    <Text style={styles.deliveryAmount}>{formatCad(order.final_price)}</Text>
                  )}
                  <GlassButton
                    label="Confirm Receipt — Release Payment"
                    onPress={() => confirmDelivery(order)}
                    loading={confirmingOrder === order.id}
                    fullWidth
                    style={styles.confirmBtn}
                    haptic
                  />
                </GlassCard>
              ))}
            </>
          )}

          {completed.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Completed</Text>
              {completed.map((order) => (
                <GlassCard key={order.id} style={[styles.orderCard, styles.completedCard]}>
                  <View style={styles.completedRow}>
                    <Text style={styles.completedCheck}>✓</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                      {order.accepted_supplier && (
                        <Text style={styles.orderMeta}>{order.accepted_supplier.business_name}</Text>
                      )}
                      {order.final_price != null && (
                        <Text style={styles.paidNote}>{formatCad(order.final_price)} paid</Text>
                      )}
                    </View>
                  </View>
                </GlassCard>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: Spacing.md },
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h2 },

  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: Spacing.sm,
  },

  orderCard: { marginBottom: 10 },
  orderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  materialName: { ...Typography.h3, flex: 1, marginRight: 8 },
  orderMeta: { ...Typography.caption, marginBottom: 4 },

  chip: {
    backgroundColor: 'rgba(255,107,0,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,107,0,0.3)',
  },
  chipText: { color: Colors.accent, fontSize: 12, fontWeight: '600' },

  emptyCard: { alignItems: 'center', paddingVertical: Spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...Typography.h3, marginBottom: 8 },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },

  bidsContainer: { marginTop: 10, gap: 8 },
  bidRow: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  bidRowBest: { borderColor: 'rgba(255,107,0,0.5)' },
  bidInfo: { flex: 1, gap: 3 },
  bidSupplier: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
  bidMeta: { ...Typography.caption },
  bidNotes: { ...Typography.caption, fontStyle: 'italic' },
  bidRight: { alignItems: 'flex-end', gap: 8 },
  bidPrice: { fontSize: 18, fontWeight: '700', color: Colors.text.primary },
  selectBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  selectBtnDisabled: { opacity: 0.5 },
  selectBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  timeline: { flexDirection: 'row', marginTop: 14, marginBottom: 4 },
  timelineStep: { flex: 1, alignItems: 'center' },
  timelineStepInner: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  timelineDotCheck: { fontSize: 10, fontWeight: '700', color: '#fff' },
  timelineLine: { flex: 1, height: 1, backgroundColor: Colors.glass.border },
  timelineLineActive: { backgroundColor: Colors.success },
  timelineLabel: { ...Typography.caption, fontSize: 10, textAlign: 'center', marginTop: 4 },
  timelineLabelActive: { color: Colors.success },

  trackingBox: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.sm,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  trackingLabel: { ...Typography.caption, marginBottom: 2 },
  trackingValue: { color: Colors.text.primary, fontSize: 14, fontWeight: '600' },

  deliveryPhoto: { width: '100%', height: 180, borderRadius: Radius.item, marginVertical: 10 },
  deliveryAmount: { fontSize: 20, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  confirmBtn: { marginTop: 8 },

  completedCard: { borderColor: 'rgba(52, 199, 89, 0.3)' },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  completedCheck: { fontSize: 28, color: Colors.success },
  paidNote: { color: Colors.success, fontSize: 13, fontWeight: '600', marginTop: 2 },
});
