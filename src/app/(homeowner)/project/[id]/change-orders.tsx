import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { formatSignedCadCents } from '@/lib/currency';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';
import type { ChangeOrder } from '@/types/database.types';

function statusVariant(status: string): 'pending' | 'active' | 'completed' | 'error' {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'error';
  return 'pending';
}

export default function HomeownerChangeOrdersScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchChangeOrders = useCallback(async () => {
    if (!projectId) {
      setErrorMessage('Project is missing. Reopen change orders from the project page.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('change_orders')
      .select('id, project_id, company_id, description, cost_delta, status, signed_by_homeowner, signed_by_company, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) {
      setErrorMessage(`Could not load change orders: ${error.message}`);
      setLoading(false);
      return;
    }
    setErrorMessage(null);
    setChangeOrders((data ?? []) as ChangeOrder[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchChangeOrders();
    if (!projectId) return;

    const channel = supabase
      .channel(`homeowner-change-orders:${projectId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'change_orders',
        filter: `project_id=eq.${projectId}`,
      }, () => fetchChangeOrders())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchChangeOrders, projectId]);

  const handleApprove = async (co: ChangeOrder) => {
    const costMsg = co.cost_delta !== null
      ? ` This documents a requested cost change of ${formatSignedCadCents(co.cost_delta)} CAD, but it does not automatically update funded escrow or milestone payments.`
      : '';

    Alert.alert(
      'Approve change order?',
      `"${co.description}"${costMsg} Your digital signature will be applied.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Sign',
          onPress: async () => {
            setResponding(co.id);
            const { data, error } = await supabase.from('change_orders').update({
              signed_by_homeowner: true,
              status: co.signed_by_company ? 'approved' : 'proposed',
            }).eq('id', co.id).select('id').maybeSingle();

            if (error) {
              Alert.alert('Error', error.message);
            } else if (!data) {
              Alert.alert('Error', 'This change order is no longer available.');
            } else {
              ReactNativeHapticFeedback.trigger('notificationSuccess');
              fetchChangeOrders();
            }
            setResponding(null);
          },
        },
      ]
    );
  };

  const handleReject = async (co: ChangeOrder) => {
    Alert.alert(
      'Reject change order?',
      'The contractor will be notified that this change has been rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setResponding(co.id);
            const { data, error } = await supabase.from('change_orders')
              .update({ status: 'rejected' })
              .eq('id', co.id)
              .select('id')
              .maybeSingle();
            if (error) {
              Alert.alert('Error', error.message);
            } else if (!data) {
              Alert.alert('Error', 'This change order is no longer available.');
            } else {
              ReactNativeHapticFeedback.trigger('notificationWarning');
              fetchChangeOrders();
            }
            setResponding(null);
          },
        },
      ]
    );
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Change Orders</Text>
            <View style={{ width: 48 }} />
          </View>

          <Text style={styles.explainerText}>
            Change orders document scope changes proposed by your contractor. Signing records approval for the changed work; it does not automatically change funded escrow or milestone payments.
          </Text>

          {loading ? (
            <View style={styles.center}>
                <Text style={Typography.bodySecondary}>Loading…</Text>
              </View>
          ) : errorMessage ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>!</Text>
              <Text style={styles.emptyTitle}>Could not load change orders</Text>
              <Text style={styles.emptySub}>{errorMessage}</Text>
            </View>
          ) : changeOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>No change orders</Text>
              <Text style={styles.emptySub}>
                Your contractor will submit change orders here if the scope of work changes.
              </Text>
            </View>
          ) : (
            changeOrders.map((co) => {
              const needsAction = co.status === 'proposed' && !co.signed_by_homeowner && co.signed_by_company;
              const isResponding = responding === co.id;

              return (
                <GlassCard key={co.id} style={[styles.orderCard, needsAction && styles.orderCardAction]}>
                  {needsAction && (
                    <View style={styles.actionBanner}>
                      <Text style={styles.actionBannerText}>⚡ Action required</Text>
                    </View>
                  )}

                  <View style={styles.orderHeader}>
                    <StatusBadge label={co.status} variant={statusVariant(co.status)} />
                    <Text style={styles.orderDate}>
                      {new Date(co.created_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>

                  <Text style={styles.orderDesc}>{co.description}</Text>

                  {co.cost_delta !== null && (
                  <View style={styles.costRow}>
                      <Text style={styles.costLabel}>Documented cost change</Text>
                      <Text style={[
                        styles.costDelta,
                        co.cost_delta >= 0 ? styles.costPos : styles.costNeg,
                      ]}>
                        {formatSignedCadCents(co.cost_delta)} CAD
                      </Text>
                    </View>
                  )}

                  <View style={styles.sigRow}>
                    <View style={[styles.sigBadge, co.signed_by_company && styles.sigBadgeSigned]}>
                      <Text style={styles.sigText}>
                        {co.signed_by_company ? '✓' : '○'} Contractor
                      </Text>
                    </View>
                    <View style={[styles.sigBadge, co.signed_by_homeowner && styles.sigBadgeSigned]}>
                      <Text style={styles.sigText}>
                        {co.signed_by_homeowner ? '✓' : '○'} You
                      </Text>
                    </View>
                  </View>

                  {needsAction && (
                    <View style={styles.actionRow}>
                      <GlassButton
                        label="Approve & Sign"
                        onPress={() => handleApprove(co)}
                        loading={isResponding}
                        size="sm"
                        haptic
                        style={styles.actionBtn}
                      />
                      <GlassButton
                        label="Reject"
                        onPress={() => handleReject(co)}
                        variant="destructive"
                        size="sm"
                        style={styles.actionBtn}
                      />
                    </View>
                  )}

                  {co.status === 'approved' && (
                    <Text style={styles.approvedNote}>✓ Both parties signed — work can proceed</Text>
                  )}

                  {co.status === 'rejected' && (
                    <Text style={styles.rejectedNote}>✕ Change order rejected</Text>
                  )}
                </GlassCard>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm,
  },
  backText: { color: Colors.text.secondary, fontSize: 15, width: 48 },
  title: { ...Typography.h2 },
  explainerText: { ...Typography.bodySecondary, lineHeight: 22, marginBottom: Spacing.md },
  orderCard: { marginBottom: 10 },
  orderCardAction: {
    borderColor: 'rgba(255, 107, 0, 0.35)',
    backgroundColor: 'rgba(255, 107, 0, 0.05)',
  },
  actionBanner: {
    marginBottom: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255, 107, 0, 0.2)',
  },
  actionBannerText: { color: Colors.accent, fontSize: 13, fontWeight: '700' },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  orderDate: { ...Typography.caption },
  orderDesc: { ...Typography.body, lineHeight: 22, marginBottom: 12 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  costLabel: { ...Typography.bodySecondary },
  costDelta: { fontSize: 18, fontWeight: '700' },
  costPos: { color: Colors.warning },
  costNeg: { color: Colors.success },
  sigRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  sigBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
  },
  sigBadgeSigned: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderColor: 'rgba(16,185,129,0.4)',
  },
  sigText: { fontSize: 12, color: Colors.text.secondary, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1 },
  approvedNote: { marginTop: 10, color: Colors.success, fontSize: 13, fontWeight: '600' },
  rejectedNote: { marginTop: 10, color: Colors.error, fontSize: 13, fontWeight: '600' },
  center: { paddingTop: 60, alignItems: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { ...Typography.h3 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
});
