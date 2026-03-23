import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

interface PaidMilestone {
  id: string;
  title: string;
  amount: number;
  completed_at: string | null;
  stripe_transfer_id: string | null;
  project: { address: string; city: string };
}

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function EarningsScreen() {
  const { user } = useAuthStore();
  const [milestones, setMilestones] = useState<PaidMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const { data: co } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!co) { setLoading(false); return; }
    setCompanyId(co.id);

    const { data } = await supabase
      .from('milestones')
      .select(`
        id, title, amount, completed_at, stripe_transfer_id,
        quotes!inner(company_id, project:projects(address, city))
      `)
      .eq('status', 'paid')
      .eq('quotes.company_id', co.id)
      .order('completed_at', { ascending: false });

    const mapped = (data ?? []).map((m: any) => ({
      id: m.id,
      title: m.title,
      amount: m.amount,
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
  // Platform takes 10%, company receives 90%
  const netEarned = Math.floor(totalEarned * 0.9);

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={Colors.accent} />}
        >
          <Text style={styles.pageTitle}>Earnings</Text>

          {/* Summary */}
          <GlassCard style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Total Received</Text>
            <Text style={styles.summaryAmount}>{formatCad(netEarned)}</Text>
            <Text style={styles.summaryNote}>After 10% WalkerAI commission</Text>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summarySubLabel}>Gross billed</Text>
              <Text style={styles.summarySubVal}>{formatCad(totalEarned)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summarySubLabel}>Commission (10%)</Text>
              <Text style={styles.summarySubVal}>-{formatCad(totalEarned - netEarned)}</Text>
            </View>
          </GlassCard>

          {/* Transaction list */}
          <Text style={styles.sectionLabel}>PAYMENT HISTORY</Text>

          {loading ? (
            <Text style={Typography.bodySecondary}>Loading…</Text>
          ) : milestones.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>💸</Text>
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
                    <Text style={styles.txNet}>{formatCad(Math.floor(m.amount * 0.9))}</Text>
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
});
