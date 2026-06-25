import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { materialOrderPaymentStatusLabel } from '@/lib/material-orders';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GradientBackground, ListItemSkeleton } from '@/components/ui';

interface MaterialOrder {
  id: string;
  status: string;
  quantity_needed: number;
  unit: string;
  quality_tier: string | null;
  offered_price: number | null;
  final_price: number | null;
  delivery_deadline: string | null;
  tracking_number: string | null;
  carrier: string | null;
  delivery_photo_url: string | null;
  material: { item: string; quantity: number | null; unit: string | null; quality_tier: string | null } | null;
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
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();

  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingOrder, setConfirmingOrder] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      if (!projectId) {
        setOrders([]);
        setErrorMessage('Project is missing. Reopen materials from the project page.');
        return;
      }
      const { data, error } = await supabase
        .from('material_orders')
        .select(`
          id, status, quantity_needed, unit, quality_tier, offered_price, final_price,
          delivery_deadline, tracking_number, carrier, delivery_photo_url,
          material:materials!material_orders_material_id_fkey(item, quantity, unit, quality_tier),
          accepted_supplier:suppliers!accepted_supplier_id(business_name, rating)
        `)
        .eq('project_id', projectId)
        .order('created_at');
      if (error) {
        setOrders([]);
        setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load material orders.'));
        return;
      }
      setOrders((data as any) ?? []);
    } catch (err) {
      setOrders([]);
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load material orders.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchOrders();
    if (!projectId) return;
    const channel = supabase
      .channel(`material_orders:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'material_orders', filter: `project_id=eq.${projectId}` },
        fetchOrders
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchOrders, projectId]);

  const confirmDelivery = async (order: MaterialOrder) => {
    if (!order.delivery_photo_url) {
      Alert.alert('Delivery photo missing', 'Ask the supplier to upload delivery proof before releasing payment.');
      return;
    }

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
              const { error } = await supabase.functions.invoke('supplier-payout', {
                body: { order_id: order.id },
              });
              if (error) throw new Error(await formatSupabaseFunctionError(error));

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              await fetchOrders();
            } catch (err) {
              Alert.alert('Release failed', await formatSupabaseFunctionError(err, 'Please try again.'));
            } finally {
              setConfirmingOrder(null);
            }
          },
        },
      ]
    );
  };

  const awaitingSupplier = orders.filter((o) => o.status === 'open');
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

          {loading && Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} style={styles.skeletonSpacing} />)}

          {!loading && errorMessage && (
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>⚠️</Text>
              <Text style={styles.emptyTitle}>Could not load materials</Text>
              <Text style={styles.emptyBody}>{errorMessage}</Text>
              <GlassButton
                label="Try Again"
                onPress={fetchOrders}
                size="sm"
                style={styles.retryButton}
                haptic
              />
            </GlassCard>
          )}

          {!loading && !errorMessage && orders.length === 0 && (
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No material orders yet</Text>
              <Text style={styles.emptyBody}>
                They'll appear here once your project is active and funded.
              </Text>
            </GlassCard>
          )}

          {awaitingSupplier.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Awaiting Supplier Claim</Text>
              {awaitingSupplier.map((order) => (
                <GlassCard key={order.id} style={styles.orderCard}>
                  <View style={styles.orderTopRow}>
                    <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>Open</Text>
                    </View>
                  </View>
                  <Text style={styles.orderMeta}>
                    {order.quantity_needed} {order.unit}
                    {order.quality_tier ? ` · ${order.quality_tier}` : ''}
                    {order.delivery_deadline ? ` · ${daysLeft(order.delivery_deadline)}` : ''}
                  </Text>
                  {(order.final_price ?? order.offered_price) != null && (
                    <Text style={styles.fixedPrice}>
                      Fixed price: {formatCad(order.final_price ?? order.offered_price ?? 0)}
                    </Text>
                  )}
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
              {needsConfirmation.map((order) => {
                const hasDeliveryProof = !!order.delivery_photo_url;
                return (
                  <GlassCard key={order.id} style={styles.orderCard}>
                    <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                    {order.accepted_supplier && (
                      <Text style={styles.orderMeta}>From {order.accepted_supplier.business_name}</Text>
                    )}
                    {hasDeliveryProof ? (
                      <Image
                        source={{ uri: order.delivery_photo_url! }}
                        style={styles.deliveryPhoto}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.missingProofText}>
                        Delivery photo proof is missing. Ask the supplier to upload proof before releasing payment.
                      </Text>
                    )}
                    {order.final_price != null && (
                      <Text style={styles.deliveryAmount}>{formatCad(order.final_price)}</Text>
                    )}
                    <GlassButton
                      label={hasDeliveryProof ? 'Confirm Receipt — Release Payment' : 'Awaiting Delivery Proof'}
                      onPress={() => confirmDelivery(order)}
                      loading={confirmingOrder === order.id}
                      disabled={!hasDeliveryProof}
                      fullWidth
                      style={styles.confirmBtn}
                      haptic
                    />
                  </GlassCard>
                );
              })}
            </>
          )}

          {completed.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Completed</Text>
              {completed.map((order) => (
                <GlassCard key={order.id} style={[styles.orderCard, styles.completedCard]}>
                    <View style={styles.completedRow}>
                      <Text style={styles.completedCheck}>✓</Text>
                      <View style={styles.completedContent}>
                        <Text style={styles.materialName}>{order.material?.item ?? 'Material'}</Text>
                      {order.accepted_supplier && (
                        <Text style={styles.orderMeta}>{order.accepted_supplier.business_name}</Text>
                      )}
                      {order.final_price != null && (
                        <Text style={styles.paidNote}>
                          {materialOrderPaymentStatusLabel(order.status, formatCad(order.final_price))}
                        </Text>
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
  skeletonSpacing: { marginBottom: 10 },
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
  retryButton: { marginTop: 12, alignSelf: 'center' },

  fixedPrice: { color: Colors.success, fontSize: 14, fontWeight: '700', marginTop: 6 },

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
  missingProofText: {
    ...Typography.caption,
    color: Colors.warning,
    lineHeight: 18,
    marginVertical: 10,
  },
  deliveryAmount: { fontSize: 20, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  confirmBtn: { marginTop: 8 },

  completedCard: { borderColor: 'rgba(52, 199, 89, 0.3)' },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  completedContent: { flex: 1 },
  completedCheck: { fontSize: 28, color: Colors.success },
  paidNote: { color: Colors.success, fontSize: 13, fontWeight: '600', marginTop: 2 },
});
