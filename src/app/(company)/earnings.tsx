import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { companyEstimatedNetPayoutCents } from '@/lib/company-payouts';
import { formatCad } from '@/lib/formatters';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { CardSkeleton, GlassCard, GradientBackground, ListItemSkeleton, StatusBadge } from '@/components/ui';
import { TradeMetricStrip, TradeScreenHeader } from '@/components/company/TradeUI';

interface PaidMilestone {
  id: string;
  title: string;
  amount: number;
  commission_rate: number | null;
  completed_at: string | null;
  stripe_transfer_id: string | null;
  project: { address: string; city: string };
}

export default function EarningsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [milestones, setMilestones] = useState<PaidMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasCompanyProfile, setHasCompanyProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fetchData = useCallback(async () => {
    if (!user) {
      setMilestones([]);
      setHasCompanyProfile(false);
      setErrorMessage('You need to be signed in to view earnings.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setErrorMessage(null);
    const { data: co, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (companyError) {
      setMilestones([]);
      setHasCompanyProfile(false);
      setErrorMessage(companyError.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!co) {
      setMilestones([]);
      setHasCompanyProfile(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setHasCompanyProfile(true);
    const { data, error } = await supabase
      .from('milestones')
      .select(`
        id, title, amount, completed_at, stripe_transfer_id,
        quotes!inner(company_id, commission_rate, project:projects(address, city))
      `)
      .eq('status', 'paid')
      .eq('quotes.company_id', co.id)
      .order('completed_at', { ascending: false });
    if (error) {
      setMilestones([]);
      setErrorMessage(error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const mapped = (data ?? []).map((m: any) => ({
      id: m.id,
      title: m.title,
      amount: m.amount,
      commission_rate: m.quotes?.commission_rate ?? null,
      completed_at: m.completed_at,
      stripe_transfer_id: m.stripe_transfer_id,
      project: m.quotes?.project ?? { address: 'Unknown', city: '' },
    }));

    setMilestones(mapped as PaidMilestone[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalEarned = milestones.reduce((s, m) => s + m.amount, 0);
  const netEarned = milestones.reduce((s, m) => s + companyEstimatedNetPayoutCents(m.amount, m.commission_rate), 0);

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={Colors.accent} />}
        >
          <TradeScreenHeader title="Earnings" subtitle="Paid milestones and payout totals" />
          <TradeMetricStrip
            items={[
              { label: 'Received', value: formatCad(netEarned), tone: netEarned ? 'success' : 'muted' },
              { label: 'Gross', value: formatCad(totalEarned), tone: totalEarned ? 'success' : 'muted' },
              { label: 'Paid items', value: milestones.length, tone: milestones.length ? 'success' : 'muted' },
            ]}
          />

          {/* Summary */}
          <GlassCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Received</Text>
            <Text style={styles.summaryAmount}>{formatCad(netEarned)}</Text>
            <Text style={styles.summaryNote}>Estimated payout received</Text>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summarySubLabel}>Gross billed</Text>
              <Text style={styles.summarySubVal}>{formatCad(totalEarned)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summarySubLabel}>Commission</Text>
              <Text style={styles.summarySubVal}>-{formatCad(totalEarned - netEarned)}</Text>
            </View>
          </GlassCard>

          {/* Transaction list */}
          <Text style={styles.sectionLabel}>PAYMENT HISTORY</Text>

          {loading ? (
            <>
              <CardSkeleton style={{ marginBottom: 12 }} />
              <ListItemSkeleton style={{ marginBottom: 10 }} />
              <ListItemSkeleton style={{ marginBottom: 10 }} />
              <ListItemSkeleton style={{ marginBottom: 10 }} />
            </>
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Icon name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Could not load earnings</Text>
              <Text style={styles.emptySub}>{errorMessage}</Text>
            </View>
          ) : !hasCompanyProfile ? (
            <View style={styles.emptyState}>
              <Icon name="domain" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Set up your company profile</Text>
              <Text style={styles.emptySub}>Complete contractor onboarding before tracking payouts.</Text>
              <TouchableOpacity style={styles.setupBtn} onPress={() => navigation.navigate('BusinessOnboarding')} activeOpacity={0.8}>
                <Text style={styles.setupBtnText}>Start Setup</Text>
              </TouchableOpacity>
            </View>
          ) : milestones.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="cash-remove" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No payments yet</Text>
              <Text style={styles.emptySub}>Payments appear here when milestones are approved.</Text>
            </View>
          ) : (
            milestones.map((m) => (
              <GlassCard key={m.id} style={styles.txCard}>
                <View style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txTitle}>{m.title}</Text>
                    <Text style={styles.txProject}>{m.project.address}{m.project.city ? `, ${m.project.city}` : ''}</Text>
                    {m.completed_at && (
                      <Text style={styles.txDate}>
                        {new Date(m.completed_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.txAmountCol}>
                    <Text style={styles.txNet}>{formatCad(companyEstimatedNetPayoutCents(m.amount, m.commission_rate))}</Text>
                    <StatusBadge label="paid" variant="paid" size="sm" />
                  </View>
                </View>
              </GlassCard>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  pageTitle: { ...Typography.h1, marginBottom: Spacing.md },
  summaryCard: { marginBottom: Spacing.md },
  summaryLabel: { ...Typography.label, marginBottom: 8 },
  summaryAmount: { fontSize: 42, fontWeight: '800', color: Colors.success, letterSpacing: -1, marginBottom: 4 },
  summaryNote: { ...Typography.caption, marginBottom: 16 },
  divider: { height: 1, backgroundColor: Colors.glass.border, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summarySubLabel: { ...Typography.bodySecondary },
  summarySubVal: { ...Typography.body },
  sectionLabel: { ...Typography.label, color: Colors.accent, marginBottom: 12 },
  txCard: { marginBottom: 10 },
  txRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  txTitle: { ...Typography.body, marginBottom: 2 },
  txProject: { ...Typography.caption, marginBottom: 2 },
  txDate: { ...Typography.caption },
  txAmountCol: { alignItems: 'flex-end', gap: 6 },
  txNet: { fontSize: 17, fontWeight: '700', color: Colors.success },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...Typography.h3 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  setupBtn: { backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  setupBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
