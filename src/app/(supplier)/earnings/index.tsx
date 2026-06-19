import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { joinedMaterialItemName } from '@/lib/material-orders';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';
import type { MaterialOrder, Supplier } from '@/types/database.types';

export default function SupplierEarnings() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadEarnings = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) setLoading(true);
    if (!user) {
      setSupplier(null);
      setOrders([]);
      setErrorMessage('You need to be signed in to view supplier earnings.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
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
      setErrorMessage(formatAppSafeErrorMessage(supplierError, 'Could not load earnings.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setSupplier(sup);
    if (!sup) {
      setOrders([]);
      setErrorMessage(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const { data, error } = await supabase
      .from('material_orders')
      .select('*, material:materials!material_orders_material_id_fkey(item)')
      .eq('accepted_supplier_id', sup.id)
      .in('status', ['confirmed', 'paid'])
      .order('confirmed_at', { ascending: false });
    if (error) {
      setOrders([]);
      setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load earnings.'));
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setOrders((data as MaterialOrder[]) ?? []);
    setErrorMessage(null);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadEarnings({ showSpinner: true });
    }, [loadEarnings])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadEarnings();
    });
    return () => subscription.remove();
  }, [loadEarnings]);

  const onRefresh = () => {
    setRefreshing(true);
    loadEarnings();
  };

  const orderAmountCents = (order: MaterialOrder) => order.final_price ?? order.offered_price ?? 0;
  const paidOrders = orders.filter((o) => o.status === 'paid');
  const confirmedOrders = orders.filter((o) => o.status === 'confirmed');
  const paidTotal = paidOrders.reduce((sum, o) => sum + orderAmountCents(o), 0);
  const processingTotal = confirmedOrders.reduce((sum, o) => sum + orderAmountCents(o), 0);
  const payoutReady = isStripePayoutLocallyReady(supplier);

  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleStripeConnect = async () => {
    if (!user?.id || !supplier?.id) {
      Alert.alert('Supplier profile required', 'Create your supplier profile before setting up payouts.');
      return;
    }
    const { data, error } = await supabase.functions.invoke('create-connect-account', {
      body: { role: 'supplier' },
    });
    if (error || !data?.url) {
      Alert.alert('Could not start payout setup', error ? await formatSupabaseFunctionError(error, 'Please try again.') : 'Please try again.');
      return;
    }
    Linking.openURL(data.url);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <Text style={styles.pageTitle}>Earnings</Text>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          {errorMessage ? (
            <GlassCard style={styles.stripeCard}>
              <Ionicons name="alert-circle-outline" size={28} color={Colors.accent} />
              <Text style={styles.stripeTitle}>Could not load earnings</Text>
              <Text style={styles.stripeBody}>{errorMessage}</Text>
            </GlassCard>
          ) : !supplier ? (
            <GlassCard style={styles.stripeCard}>
              <Ionicons name="storefront-outline" size={28} color={Colors.accent} />
              <Text style={styles.stripeTitle}>Set up your supplier profile</Text>
              <Text style={styles.stripeBody}>Create a supplier profile before viewing payouts or connecting Stripe.</Text>
              <TouchableOpacity style={styles.stripeBtn} activeOpacity={0.8} onPress={() => navigation.navigate('SupplierBusinessOnboarding')}>
                <Text style={styles.stripeBtnText}>Start Setup</Text>
              </TouchableOpacity>
            </GlassCard>
          ) : null}

          {/* Summary cards */}
          {supplier && <View style={styles.statsRow}>
            <GlassCard style={[styles.statCard, { borderColor: 'rgba(52,211,153,0.3)' }]}>
              <Text style={styles.statLabel}>Paid to Date</Text>
              <Text style={[styles.statValue, { color: '#34D399' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {fmt(paidTotal)}
              </Text>
            </GlassCard>
            <GlassCard style={[styles.statCard, { borderColor: 'rgba(255,107,0,0.3)' }]}>
              <Text style={styles.statLabel}>Processing</Text>
              <Text style={[styles.statValue, { color: Colors.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {fmt(processingTotal)}
              </Text>
            </GlassCard>
          </View>}

          {supplier && <GlassCard style={styles.payoutCard}>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Paid to date</Text>
              <Text style={[styles.payoutValue, { color: '#34D399' }]}>{fmt(paidTotal)}</Text>
            </View>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Processing</Text>
              <Text style={styles.payoutValue}>{fmt(processingTotal)}</Text>
            </View>
            <View style={styles.payoutRow}>
              <Text style={styles.payoutLabel}>Completed orders</Text>
              <Text style={styles.payoutValue}>{paidOrders.length}</Text>
            </View>
          </GlassCard>}

          {/* Stripe Connect CTA until payouts are truly active */}
          {supplier && !payoutReady && (
            <GlassCard style={styles.stripeCard}>
              <Ionicons name="card-outline" size={28} color={Colors.accent} />
              <Text style={styles.stripeTitle}>
                {supplier.stripe_account_id ? 'Finish payout setup' : 'Set up payouts'}
              </Text>
              <Text style={styles.stripeBody}>
                {supplier.stripe_account_id
                  ? 'Finish Stripe onboarding before claiming fixed-price material orders.'
                  : 'Connect your bank account via Stripe to receive payments when orders are confirmed.'}
              </Text>
              <TouchableOpacity style={styles.stripeBtn} activeOpacity={0.8} onPress={handleStripeConnect}>
                <Text style={styles.stripeBtnText}>
                  {supplier.stripe_account_id ? 'Continue Stripe Setup' : 'Connect Bank Account'}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          {/* Order history */}
          {supplier && <Text style={styles.sectionTitle}>Order History</Text>}
          {supplier && (orders.length === 0 ? (
            <Text style={styles.emptyText}>No completed orders yet.</Text>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyItem}>{joinedMaterialItemName(order.material)}</Text>
                  <Text style={styles.historyDate}>
                    {order.confirmed_at ? new Date(order.confirmed_at).toLocaleDateString('en-CA') : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.historyAmount}>{fmt(orderAmountCents(order))}</Text>
                  <View style={[styles.historyBadge, { backgroundColor: order.status === 'paid' ? 'rgba(52,211,153,0.15)' : 'rgba(255,107,0,0.15)' }]}>
                    <Text style={[styles.historyBadgeText, { color: order.status === 'paid' ? '#34D399' : Colors.accent }]}>
                      {order.status === 'paid' ? 'Paid' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          ))}
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
  statValue: { fontSize: 22, fontWeight: '800', textAlign: 'center', width: '100%' },
  payoutCard: { padding: Spacing.md, gap: 10 },
  payoutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  payoutLabel: { fontSize: 14, color: Colors.text.secondary },
  payoutValue: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
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
