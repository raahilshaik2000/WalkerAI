import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
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
import { formatCadCents } from '@/lib/currency';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { joinedMaterialItemName } from '@/lib/material-orders';
import { pickPhotosWithSource } from '@/lib/media-picker';
import { getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
import { useInvalidateSupplierQueries, useSupplierActiveOrders } from '@/lib/supplier-data';
import { useSilentFocusRefetch } from '@/lib/silent-focus-refetch';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, ListItemSkeleton } from '@/components/ui';
import type { MaterialOrder } from '@/types/database.types';
import type { MaterialOrderStatus } from '@/constants/enums';

const STATUS_STEPS: MaterialOrderStatus[] = ['accepted', 'processing', 'shipped', 'delivered', 'confirmed', 'paid'];

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  confirmed: 'Confirmed',
  paid: 'Paid',
};

function formatCad(cents: number | null | undefined): string | null {
  if (cents == null) return null;
  return formatCadCents(cents);
}

function formatOrderValue(order: MaterialOrder): string | null {
  const price = order.final_price ?? order.offered_price;
  if (price == null) return null;
  return formatCad(price);
}

function deadlineLabel(deadline: string | null): string | null {
  if (!deadline) return null;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  return `${days}d left`;
}

export default function SupplierActiveOrders() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);
  const invalidateSupplier = useInvalidateSupplierQueries();

  const { profileQuery, ordersQuery, supplier } = useSupplierActiveOrders(user?.id);
  const supplierId = supplier?.id ?? null;
  const orders = ordersQuery.data ?? [];
  const showSkeleton =
    (!!user?.id && !supplier && profileQuery.isLoading)
    || (!!supplier && !ordersQuery.data && ordersQuery.isLoading);
  const errorMessage = !user?.id
    ? 'You need to be signed in to view supplier orders.'
    : profileQuery.error
      ? formatAppSafeErrorMessage(profileQuery.error, 'Could not load supplier profile.')
      : ordersQuery.error
        ? formatAppSafeErrorMessage(ordersQuery.error, 'Could not load active supplier orders.')
        : null;

  const refetchAll = useCallback(async () => {
    await Promise.all([profileQuery.refetch(), ordersQuery.refetch()]);
  }, [ordersQuery, profileQuery]);
  useSilentFocusRefetch(refetchAll);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchAll();
    setRefreshing(false);
  };

  const markProcessing = async (order: MaterialOrder) => {
    if (!supplierId) {
      Alert.alert('Supplier setup required', 'Create your supplier profile before updating material orders.');
      return;
    }
    setUpdating(order.id);
    try {
      const { data, error } = await supabase
        .from('material_orders')
        .update({ status: 'processing' })
        .eq('id', order.id)
        .eq('accepted_supplier_id', supplierId)
        .eq('status', 'accepted')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This order is no longer available.');
      invalidateSupplier(user?.id, supplierId);
      await refetchAll();
    } catch (err) {
      Alert.alert('Could not update order', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setUpdating(null);
    }
  };

  const markShipped = async (order: MaterialOrder) => {
    if (!supplierId) {
      Alert.alert('Supplier setup required', 'Create your supplier profile before updating material orders.');
      return;
    }
    const tn = tracking[order.id]?.trim();
    const carr = carrier[order.id]?.trim();
    if (!tn) { Alert.alert('Required', 'Please enter a tracking number.'); return; }
    setUpdating(order.id);
    try {
      const { data, error } = await supabase
        .from('material_orders')
        .update({ status: 'shipped', tracking_number: tn, carrier: carr || null, shipped_at: new Date().toISOString() })
        .eq('id', order.id)
        .eq('accepted_supplier_id', supplierId)
        .eq('status', 'processing')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This order is no longer available.');
      invalidateSupplier(user?.id, supplierId);
      await refetchAll();
    } catch (err) {
      Alert.alert('Could not mark order shipped', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setUpdating(null);
    }
  };

  const markDelivered = async (order: MaterialOrder) => {
    if (!supplierId) {
      Alert.alert('Supplier setup required', 'Create your supplier profile before updating material orders.');
      return;
    }
    setUpdating(order.id);
    try {
      const assets = await pickPhotosWithSource({
        quality: 0.7,
      });
      let photoUrl: string | null = null;
      if (assets?.[0]?.uri) {
        const asset = getUploadMetadata(assets[0]);
        const path = `delivery-photos/${order.id}.${asset.extension}`;
        const upload = await uploadFile('progress-photos', path, asset.uri, asset.contentType);
        photoUrl = upload.publicUrl;
      } else {
        Alert.alert('Photo required', 'Please upload a delivery photo before marking the order delivered.');
        return;
      }
      const { data, error } = await supabase
        .from('material_orders')
        .update({ status: 'delivered', delivered_at: new Date().toISOString(), delivery_photo_url: photoUrl })
        .eq('id', order.id)
        .eq('accepted_supplier_id', supplierId)
        .eq('status', 'shipped')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('This order is no longer available.');
      invalidateSupplier(user?.id, supplierId);
      await refetchAll();
    } catch (err) {
      Alert.alert('Could not mark order delivered', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setUpdating(null);
    }
  };

  const stepIndex = (status: string) => STATUS_STEPS.indexOf(status as MaterialOrderStatus);

  if (showSkeleton) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Orders</Text>
            <View style={styles.headerSpacer} />
          </View>
          <View style={styles.skeletonList}>
            {Array.from({ length: 4 }).map((_, index) => (
              <ListItemSkeleton key={`active-skel-${index}`} style={styles.skeletonItem} />
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
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Orders</Text>
          <View style={styles.headerSpacer} />
        </View>

        {errorMessage ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Could not load active orders</Text>
            <Text style={styles.emptyBody}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { void refetchAll(); }} activeOpacity={0.8}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : !user?.id ? (
          <View style={styles.empty}>
            <Ionicons name="person-circle-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Sign in required</Text>
            <Text style={styles.emptyBody}>Sign in to view active supplier orders.</Text>
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
        ) : orders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>No active orders</Text>
            <Text style={styles.emptyBody}>Claim fixed-price orders from the order feed to see them here.</Text>
          </View>
        ) : (
          <FlatList
            data={orders}
            keyExtractor={(o) => o.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            renderItem={({ item }) => {
              const currentStep = stepIndex(item.status);
              const isExpanded = expanded === item.id;
              const orderValue = formatOrderValue(item);
              const deadline = deadlineLabel(item.delivery_deadline);
              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => setExpanded(isExpanded ? null : item.id)}
                  activeOpacity={0.8}
                >
                  {/* Header */}
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardItem} numberOfLines={1}>{joinedMaterialItemName(item.material)}</Text>
                    <View style={[styles.statusBadge, item.status === 'paid' ? styles.statusBadgePaid : styles.statusBadgeActive]}>
                      <Text style={[styles.statusText, item.status === 'paid' ? styles.statusTextPaid : styles.statusTextActive]}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardQty}>{item.quantity_needed} {item.unit}</Text>

                  <View style={styles.metaRow}>
                    {orderValue ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="cash-outline" size={13} color={Colors.success} />
                        <Text style={styles.metaChipText}>{orderValue} order value</Text>
                      </View>
                    ) : null}
                    {deadline ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="time-outline" size={13} color={Colors.text.tertiary} />
                        <Text style={styles.metaChipText}>{deadline}</Text>
                      </View>
                    ) : null}
                    {item.quality_tier ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="ribbon-outline" size={13} color={Colors.accent} />
                        <Text style={styles.metaChipText}>{item.quality_tier}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Timeline */}
                  <View style={styles.timeline}>
                    {STATUS_STEPS.map((step, i) => (
                      <View key={step} style={styles.timelineStep}>
                        <View style={[styles.timelineDot, i <= currentStep && styles.timelineDotActive]} />
                        {i < STATUS_STEPS.length - 1 && (
                          <View style={[styles.timelineLine, i < currentStep && styles.timelineLineActive]} />
                        )}
                      </View>
                    ))}
                  </View>

                  {/* Actions */}
                  {isExpanded && (
                    <View style={styles.actions}>
                      {item.delivery_address ? (
                        <View style={styles.detailBlock}>
                          <Text style={styles.detailLabel}>Delivery Address</Text>
                          <Text style={styles.detailValue}>{item.delivery_address}</Text>
                        </View>
                      ) : null}
                      {orderValue ? (
                        <View style={styles.detailBlock}>
                          <Text style={styles.detailLabel}>Order Value</Text>
                          <Text style={styles.detailValue}>{orderValue}</Text>
                        </View>
                      ) : null}
                      {item.notes ? (
                        <View style={styles.detailBlock}>
                          <Text style={styles.detailLabel}>Order Notes</Text>
                          <Text style={styles.detailValue}>{item.notes}</Text>
                        </View>
                      ) : null}
                      {item.tracking_number ? (
                        <View style={styles.detailBlock}>
                          <Text style={styles.detailLabel}>Tracking</Text>
                          <Text style={styles.detailValue}>
                            {item.carrier ? `${item.carrier}  ` : ''}{item.tracking_number}
                          </Text>
                        </View>
                      ) : null}
                      {item.delivery_photo_url ? (
                        <Image source={{ uri: item.delivery_photo_url }} style={styles.deliveryPhoto} />
                      ) : null}
                      {item.status === 'accepted' ? (
                        <GlassButton
                          label="Start Processing"
                          onPress={() => markProcessing(item)}
                          loading={updating === item.id}
                          fullWidth
                          size="md"
                        />
                      ) : item.status === 'processing' ? (
                        <>
                          <TextInput
                            style={styles.input}
                            placeholder="Tracking number"
                            placeholderTextColor={Colors.text.tertiary}
                            value={tracking[item.id] ?? ''}
                            onChangeText={(v) => setTracking((p) => ({ ...p, [item.id]: v }))}
                          />
                          <TextInput
                            style={[styles.input, styles.carrierInput]}
                            placeholder="Carrier (e.g. Purolator, Canada Post)"
                            placeholderTextColor={Colors.text.tertiary}
                            value={carrier[item.id] ?? ''}
                            onChangeText={(v) => setCarrier((p) => ({ ...p, [item.id]: v }))}
                          />
                          <GlassButton
                            label="Mark as Shipped"
                            onPress={() => markShipped(item)}
                            loading={updating === item.id}
                            fullWidth
                            size="md"
                            style={styles.markShippedButton}
                          />
                        </>
                      ) : item.status === 'shipped' ? (
                        <GlassButton
                          label="Mark as Delivered + Upload Photo"
                          onPress={() => markDelivered(item)}
                          loading={updating === item.id}
                          fullWidth
                          size="md"
                        />
                      ) : item.status === 'delivered' ? (
                        <Text style={styles.waitingText}>Waiting for homeowner to confirm receipt...</Text>
                      ) : item.status === 'confirmed' ? (
                        <Text style={styles.waitingText}>Payment processing...</Text>
                      ) : item.status === 'paid' ? (
                        <Text style={styles.paidText}>✓ Paid{orderValue ? ` — ${orderValue}` : ''}</Text>
                      ) : null}
                    </View>
                  )}
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
  headerSpacer: { width: 22 },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: Spacing.xl },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: Spacing.md, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardItem: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, flex: 1 },
  cardQty: { fontSize: 13, color: Colors.text.secondary },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 9,
  },
  metaChipText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgePaid: { backgroundColor: 'rgba(52,211,153,0.15)' },
  statusBadgeActive: { backgroundColor: 'rgba(255,107,0,0.15)' },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  statusTextPaid: { color: '#34D399' },
  statusTextActive: { color: Colors.accent },
  timeline: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  timelineStep: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.15)' },
  timelineDotActive: { backgroundColor: Colors.accent },
  timelineLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  timelineLineActive: { backgroundColor: Colors.accent },
  actions: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: Spacing.sm, marginTop: 4 },
  detailBlock: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    marginBottom: 10,
  },
  detailLabel: { fontSize: 11, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  detailValue: { fontSize: 13, lineHeight: 19, color: Colors.text.secondary },
  deliveryPhoto: {
    width: '100%',
    height: 160,
    borderRadius: Radius.item,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: Radius.item, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 12, color: Colors.text.primary, fontSize: 14 },
  carrierInput: { marginTop: 8 },
  markShippedButton: { marginTop: 12 },
  waitingText: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', fontStyle: 'italic' },
  paidText: { fontSize: 14, color: '#34D399', fontWeight: '700', textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  retryBtnText: { fontSize: 13, fontWeight: '700', color: Colors.accentFg },
});
