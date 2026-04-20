import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';
import type { MaterialOrder, MaterialOrderBid } from '@/types/database.types';

export default function SupplierOrderDetail() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId } = route.params;
  const [order, setOrder] = useState<MaterialOrder | null>(null);
  const [bids, setBids] = useState<MaterialOrderBid[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: ord }, { data: bidList }] = await Promise.all([
        supabase.from('material_orders').select('*, material:materials(*)').eq('id', orderId).single(),
        supabase.from('material_order_bids').select('*, supplier:suppliers(business_name,rating)').eq('order_id', orderId).order('submitted_at'),
      ]);
      setOrder(ord as MaterialOrder);
      setBids((bidList as MaterialOrderBid[]) ?? []);
      setLoading(false);
    })();
  }, [orderId]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  if (!order) return null;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Order Detail</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>Material Needed</Text>
            <Text style={styles.materialName}>{order.material?.item}</Text>
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

          {bids.length > 0 && (
            <GlassCard style={styles.section}>
              <Text style={styles.sectionTitle}>Bids ({bids.length})</Text>
              {bids.map((bid) => (
                <View key={bid.id} style={[styles.bidRow, bid.status === 'selected' && styles.bidRowSelected]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bidSupplier}>{(bid.supplier as any)?.business_name ?? 'Supplier'}</Text>
                    <Text style={styles.bidMeta}>{bid.lead_time_days}d lead time{bid.notes ? ` • ${bid.notes}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.bidPrice}>${(bid.total_price / 100).toFixed(2)}</Text>
                    {bid.status === 'selected' && (
                      <Text style={styles.selectedLabel}>Selected</Text>
                    )}
                  </View>
                </View>
              ))}
            </GlassCard>
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
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 16 },
  section: { padding: Spacing.md },
  sectionTitle: { fontSize: 13, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  materialName: { fontSize: 20, fontWeight: '800', color: Colors.text.primary, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 24 },
  bidRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  bidRowSelected: { backgroundColor: 'rgba(52,211,153,0.07)', borderRadius: 10, paddingHorizontal: 10, borderBottomWidth: 0, marginBottom: 2 },
  bidSupplier: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
  bidMeta: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  bidPrice: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  selectedLabel: { fontSize: 11, color: '#34D399', fontWeight: '700', marginTop: 2 },
});
