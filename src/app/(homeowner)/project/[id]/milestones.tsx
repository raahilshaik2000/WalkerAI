import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, ListItemSkeleton } from '@/components/ui';

interface Milestone {
  id: string;
  title: string;
  amount: number;
  status: string;
  sort_order: number;
  due_date: string | null;
  completed_at: string | null;
  stripe_transfer_id: string | null;
}

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100);
}

const MILESTONE_STATUS_VARIANT: Record<string, any> = {
  pending: 'neutral',
  started: 'info',
  in_progress: 'dispatching',
  completed: 'warning',
  homeowner_approved: 'approved',
  paid: 'completed',
};

export default function MilestonesScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);

  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);

  const getQuoteId = async (pId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('quotes')
      .select('id')
      .eq('project_id', pId)
      .eq('status', 'approved')
      .maybeSingle();
    return data?.id ?? null;
  };

  const fetchMilestones = async () => {
    const quoteId = await getQuoteId(projectId);
    if (!quoteId) {
      setEmptyMessage('No approved quote yet. Milestones will appear after you approve a contractor quote.');
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('milestones')
      .select('id, title, amount, status, sort_order, due_date, completed_at, stripe_transfer_id')
      .eq('quote_id', quoteId)
      .order('sort_order');
    setMilestones(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchMilestones();
    const channel = supabase
      .channel(`milestones:${projectId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'milestones' }, fetchMilestones)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  const handleApprove = async (milestoneId: string) => {
    Alert.alert(
      'Release payment?',
      'This will transfer the milestone amount to your contractor. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release Payment',
          style: 'destructive',
          onPress: async () => {
            setReleasing(milestoneId);
            try {
              const { data, error } = await supabase.functions.invoke('release-milestone', {
                body: { milestone_id: milestoneId },
              });
              if (error) throw error;
              ReactNativeHapticFeedback.trigger('notificationSuccess');
              await fetchMilestones();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to release payment.');
            } finally {
              setReleasing(null);
            }
          },
        },
      ]
    );
  };

  const totalAmount = milestones.reduce((s, m) => s + m.amount, 0);
  const paidAmount = milestones.filter((m) => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const progressPct = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.backText} onPress={() => navigation.goBack()}>← Back</Text>
            <Text style={styles.title}>Milestones</Text>
          </View>

          {/* Escrow progress */}
          <GlassCard style={styles.escrowCard}>
            <Text style={styles.escrowLabel}>Escrow Progress</Text>
            <Text style={styles.escrowAmount}>
              {formatCad(paidAmount)} <Text style={styles.escrowOf}>of {formatCad(totalAmount)} released</Text>
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
            </View>
          </GlassCard>

          {emptyMessage && !loading && (
            <GlassCard style={{ marginBottom: Spacing.md }}>
              <Text style={{ ...Typography.bodySecondary, lineHeight: 22 }}>{emptyMessage}</Text>
            </GlassCard>
          )}

          {loading
            ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} style={{ marginBottom: 10 }} />)
            : milestones.map((milestone, index) => {
                const canApprove = milestone.status === 'completed' && !milestone.stripe_transfer_id;
                const isPaid = milestone.status === 'paid';

                return (
                  <GlassCard key={milestone.id} style={styles.milestoneCard}>
                    {/* Step indicator */}
                    <View style={styles.stepRow}>
                      <View style={[styles.stepDot, isPaid && styles.stepDotPaid, canApprove && styles.stepDotApprove]}>
                        <Text style={styles.stepDotText}>
                          {isPaid ? '✓' : String(index + 1)}
                        </Text>
                      </View>
                      {index < milestones.length - 1 && (
                        <View style={[styles.stepLine, isPaid && styles.stepLinePaid]} />
                      )}
                    </View>

                    <View style={styles.milestoneContent}>
                      <View style={styles.milestoneHeader}>
                        <Text style={styles.milestoneTitle}>{milestone.title}</Text>
                        <StatusBadge
                          label={milestone.status.replace('_', ' ')}
                          variant={MILESTONE_STATUS_VARIANT[milestone.status]}
                          size="sm"
                        />
                      </View>

                      <Text style={styles.milestoneAmount}>{formatCad(milestone.amount)}</Text>

                      {milestone.due_date && (
                        <Text style={styles.dueDate}>
                          Due {new Date(milestone.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                        </Text>
                      )}

                      {canApprove && (
                        <GlassButton
                          label="Approve & Release Payment"
                          onPress={() => handleApprove(milestone.id)}
                          loading={releasing === milestone.id}
                          fullWidth
                          size="sm"
                          style={styles.approveBtn}
                          haptic
                        />
                      )}

                      {isPaid && (
                        <Text style={styles.paidNote}>✓ Payment released</Text>
                      )}
                    </View>
                  </GlassCard>
                );
              })}
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
  escrowCard: { marginBottom: Spacing.md },
  escrowLabel: { ...Typography.label, marginBottom: 8 },
  escrowAmount: { fontSize: 22, fontWeight: '700', color: Colors.text.primary, marginBottom: 12 },
  escrowOf: { fontSize: 16, fontWeight: '400', color: Colors.text.secondary },
  progressTrack: { height: 6, backgroundColor: Colors.glass.surface, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.success, borderRadius: 3 },
  milestoneCard: { marginBottom: 10, flexDirection: 'row', gap: 14 },
  stepRow: { alignItems: 'center', paddingTop: 2 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotPaid: { backgroundColor: Colors.success, borderColor: Colors.success },
  stepDotApprove: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  stepDotText: { fontSize: 12, fontWeight: '700', color: Colors.text.primary },
  stepLine: { width: 1, flex: 1, backgroundColor: Colors.glass.border, marginTop: 4 },
  stepLinePaid: { backgroundColor: Colors.success },
  milestoneContent: { flex: 1 },
  milestoneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  milestoneTitle: { ...Typography.h3, flex: 1, marginRight: 8 },
  milestoneAmount: { fontSize: 20, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  dueDate: { ...Typography.caption, marginBottom: 10 },
  approveBtn: { marginTop: 8 },
  paidNote: { color: Colors.success, fontSize: 13, fontWeight: '600', marginTop: 6 },
});
