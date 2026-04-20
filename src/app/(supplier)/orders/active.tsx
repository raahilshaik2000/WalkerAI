import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';
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

export default function SupplierActiveOrders() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [carrier, setCarrier] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data: sup } = await supabase.from('suppliers').select('*').eq('user_id', user.id).single();
    setSupplier(sup);
    if (!sup) { setLoading(false); return; }

    const { data } = await supabase
      .from('material_orders')
      .select('*, material:materials(*)')
      .eq('accepted_supplier_id', sup.id)
      .not('status', 'in', '("open","cancelled")')
      .order('created_at', { ascending: false });
    setOrders((data as MaterialOrder[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const markShipped = async (order: MaterialOrder) => {
    const tn = tracking[order.id]?.trim();
    const carr = carrier[order.id]?.trim();
    if (!tn) { Alert.alert('Required', 'Please enter a tracking number.'); return; }
    setUpdating(order.id);
    const { error } = await supabase
      .from('material_orders')
      .update({ status: 'shipped', tracking_number: tn, carrier: carr || null, shipped_at: new Date().toISOString() })
      .eq('id', order.id);
    if (!error) await fetchData();
    setUpdating(null);
  };

  const markDelivered = async (order: MaterialOrder) => {
    setUpdating(order.id);
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.7 });
    let photoUrl: string | null = null;
    if (result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      const ext = result.assets[0].fileName?.split('.').pop() ?? 'jpg';
      const path = `delivery-photos/${order.id}.${ext}`;
      const blob = await (await fetch(uri)).blob();
      await supabase.storage.from('progress-photos').upload(path, blob, { upsert: true });
      const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(path);
      photoUrl = urlData.publicUrl;
    }
    await supabase
      .from('material_orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString(), delivery_photo_url: photoUrl })
      .eq('id', order.id);
    await fetchData();
    setUpdating(null);
  };

  const stepIndex = (status: string) => STATUS_STEPS.indexOf(status as MaterialOrderStatus);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Orders</Text>
          <View style={{ width: 22 }} />
        </View>

        {orders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>No active orders</Text>
            <Text style={styles.emptyBody}>Win bids from the order feed to see them here.</Text>
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
              return (
                <TouchableOpacity
                  style={styles.card}
                  onPress={() => setExpanded(isExpanded ? null : item.id)}
                  activeOpacity={0.8}
                >
                  {/* Header */}
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardItem} numberOfLines={1}>{item.material?.item ?? 'Material'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: item.status === 'paid' ? 'rgba(52,211,153,0.15)' : 'rgba(255,107,0,0.15)' }]}>
                      <Text style={[styles.statusText, { color: item.status === 'paid' ? '#34D399' : Colors.accent }]}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardQty}>{item.quantity_needed} {item.unit}</Text>

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
                      {item.status === 'accepted' || item.status === 'processing' ? (
                        <>
                          <TextInput
                            style={styles.input}
                            placeholder="Tracking number"
                            placeholderTextColor={Colors.text.tertiary}
                            value={tracking[item.id] ?? ''}
                            onChangeText={(v) => setTracking((p) => ({ ...p, [item.id]: v }))}
                          />
                          <TextInput
                            style={[styles.input, { marginTop: 8 }]}
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
                            style={{ marginTop: 12 }}
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
                        <Text style={styles.paidText}>✓ Paid — {item.final_price ? `$${(item.final_price / 100).toFixed(2)}` : ''}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  headerTitle: { ...Typography.h2 },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: Spacing.xl },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: Spacing.md, gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardItem: { fontSize: 16, fontWeight: '700', color: Colors.text.primary, flex: 1 },
  cardQty: { fontSize: 13, color: Colors.text.secondary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  timeline: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  timelineStep: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.15)' },
  timelineDotActive: { backgroundColor: Colors.accent },
  timelineLine: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  timelineLineActive: { backgroundColor: Colors.accent },
  actions: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: Spacing.sm, marginTop: 4 },
  input: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: Radius.item, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 12, color: Colors.text.primary, fontSize: 14 },
  waitingText: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', fontStyle: 'italic' },
  paidText: { fontSize: 14, color: '#34D399', fontWeight: '700', textAlign: 'center' },
});
