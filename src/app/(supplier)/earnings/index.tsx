import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';

export default function SupplierEarnings() {
  const { user } = useAuthStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: sup } = await supabase.from('suppliers').select('*').eq('user_id', user.id).single();
      setSupplier(sup);
      if (!sup) { setLoading(false); return; }
      const { data } = await supabase
        .from('material_orders')
        .select('*, material:materials(item)')
        .eq('accepted_supplier_id', sup.id)
        .in('status', ['confirmed', 'paid'])
        .order('confirmed_at', { ascending: false });
      setOrders((data as MaterialOrder[]) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const totalPaid = orders.filter((o) => o.status === 'paid').reduce((sum, o) => sum + (o.final_price ?? 0), 0);
  const pending = orders.filter((o) => o.status === 'confirmed').reduce((sum, o) => sum + (o.final_price ?? 0), 0);
  const platformFees = orders.filter((o) => o.status === 'paid').reduce((sum, o) => sum + Math.round((o.final_price ?? 0) * (o.platform_fee_pct / 100)), 0);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleStripeConnect = async () => {
    const { data, error } = await supabase.functions.invoke('stripe-connect', {
      body: { user_id: user?.id, role: 'supplier' },
    });
    if (error || !data?.url) {
      Alert.alert('Error', 'Could not start Stripe onboarding. Please try again.');
      return;
    }
    Linking.openURL(data.url);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <Text style={styles.pageTitle}>Earnings</Text>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary cards */}
          <View style={styles.statsRow}>
            <GlassCard style={[styles.statCard, { borderColor: 'rgba(52,211,153,0.3)' }]}>
              <Text style={styles.statLabel}>Total Earned</Text>
              <Text style={[styles.statValue, { color: '#34D399' }]}>{fmt(totalPaid)}</Text>
            </GlassCard>
            <GlassCard style={[styles.statCard, { borderColor: 'rgba(255,107,0,0.3)' }]}>
              <Text style={styles.statLabel}>Pending</Text>
              <Text style={[styles.statValue, { color: Colors.accent }]}>{fmt(pending)}</Text>
            </GlassCard>
          </View>

          <GlassCard style={styles.feesCard}>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Platform fees paid</Text>
              <Text style={styles.feeValue}>{fmt(platformFees)}</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Net received</Text>
              <Text style={[styles.feeValue, { color: '#34D399' }]}>{fmt(totalPaid - platformFees)}</Text>
            </View>
          </GlassCard>

          {/* Stripe Connect CTA if no account */}
          {!supplier?.stripe_account_id && (
            <GlassCard style={styles.stripeCard}>
              <Ionicons name="card-outline" size={28} color={Colors.accent} />
              <Text style={styles.stripeTitle}>Set up payouts</Text>
              <Text style={styles.stripeBody}>Connect your bank account via Stripe to receive payments when orders are confirmed.</Text>
              <TouchableOpacity style={styles.stripeBtn} activeOpacity={0.8} onPress={handleStripeConnect}>
                <Text style={styles.stripeBtnText}>Connect Bank Account</Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          {/* Order history */}
          <Text style={styles.sectionTitle}>Order History</Text>
          {orders.length === 0 ? (
            <Text style={styles.emptyText}>No completed orders yet.</Text>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyItem}>{(order.material as any)?.item ?? 'Material'}</Text>
                  <Text style={styles.historyDate}>
                    {order.confirmed_at ? new Date(order.confirmed_at).toLocaleDateString('en-CA') : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.historyAmount}>{fmt(order.final_price ?? 0)}</Text>
                  <View style={[styles.historyBadge, { backgroundColor: order.status === 'paid' ? 'rgba(52,211,153,0.15)' : 'rgba(255,107,0,0.15)' }]}>
                    <Text style={[styles.historyBadgeText, { color: order.status === 'paid' ? '#34D399' : Colors.accent }]}>
                      {order.status === 'paid' ? 'Paid' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  pageTitle: { ...Typography.h2, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 16 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, padding: Spacing.md, alignItems: 'center', gap: 6 },
  statLabel: { fontSize: 12, color: Colors.text.tertiary },
  statValue: { fontSize: 22, fontWeight: '800' },
  feesCard: { padding: Spacing.md, gap: 10 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  feeLabel: { fontSize: 14, color: Colors.text.secondary },
  feeValue: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
  stripeCard: { padding: Spacing.lg, alignItems: 'center', gap: 10 },
  stripeTitle: { ...Typography.h3 },
  stripeBody: { ...Typography.bodySecondary, textAlign: 'center' },
  stripeBtn: { backgroundColor: Colors.success, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 4 },
  stripeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text.primary },
  emptyText: { fontSize: 14, color: Colors.text.tertiary, textAlign: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  historyItem: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
  historyDate: { fontSize: 12, color: Colors.text.tertiary, marginTop: 2 },
  historyAmount: { fontSize: 15, fontWeight: '700', color: Colors.text.primary },
  historyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 4 },
  historyBadgeText: { fontSize: 11, fontWeight: '700' },
});
