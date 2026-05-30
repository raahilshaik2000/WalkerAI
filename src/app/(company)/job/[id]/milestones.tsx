import { useEffect, useState } from 'react';
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
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { formatStatusLabel } from '@/lib/formatters';
import { GlassButton, GradientBackground, StatusBadge } from '@/components/ui';
import { TradeEmptyState, TradeMetricStrip, TradePanel } from '@/components/company/TradeUI';

interface Milestone {
  id: string;
  title: string;
  amount: number;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface QuoteSummary {
  id: string;
  status: string | null;
  submitted_at: string | null;
}

const STATUS_ORDER = ['pending', 'started', 'in_progress', 'completed', 'homeowner_approved', 'paid'];

const STATUS_NEXT: Record<string, string> = {
  pending: 'started',
  started: 'in_progress',
  in_progress: 'completed',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Mark Started',
  started: 'Mark In Progress',
  in_progress: 'Mark Complete',
};

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(cents / 100);
}

function statusVariant(status: string): 'pending' | 'active' | 'completed' | 'paid' {
  if (status === 'paid') return 'paid';
  if (status === 'homeowner_approved') return 'completed';
  if (status === 'completed') return 'completed';
  if (status === 'in_progress' || status === 'started') return 'active';
  return 'pending';
}

export default function CompanyMilestonesScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchMilestones = async () => {
    const { data: quotes, error: quoteError } = await supabase
      .from('quotes')
      .select('id, status, submitted_at')
      .eq('project_id', projectId)
      .order('submitted_at', { ascending: false });

    if (quoteError) {
      Alert.alert('Error', quoteError.message);
      setLoading(false);
      return;
    }

    const quoteData = ((quotes ?? []) as QuoteSummary[]).find((q) => q.status === 'approved')
      ?? (quotes?.[0] as QuoteSummary | undefined);

    if (!quoteData) {
      setMilestones([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('milestones')
      .select('id, title, amount, status, due_date, completed_at, sort_order')
      .eq('quote_id', quoteData.id)
      .order('sort_order');

    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }

    setMilestones((data ?? []) as Milestone[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchMilestones();

    const channel = supabase
      .channel(`company-milestones:${projectId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'milestones',
      }, () => fetchMilestones())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  const handleAdvanceStatus = async (milestone: Milestone) => {
    const nextStatus = STATUS_NEXT[milestone.status];
    if (!nextStatus) return;

    const isComplete = nextStatus === 'completed';
    const confirmMessage = isComplete
      ? `Mark "${milestone.title}" as complete? The homeowner will be asked to approve and release payment.`
      : `Mark "${milestone.title}" as ${nextStatus.replace('_', ' ')}?`;

    Alert.alert('Update milestone', confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdating(milestone.id);
          const updates: Record<string, unknown> = { status: nextStatus };
          if (isComplete) updates.completed_at = new Date().toISOString();

          const { error } = await supabase.from('milestones').update(updates).eq('id', milestone.id);
          if (error) {
            Alert.alert('Error', error.message);
            setUpdating(null);
            return;
          }

          ReactNativeHapticFeedback.trigger('notificationSuccess');
          setMilestones((prev) =>
            prev.map((m) => m.id === milestone.id ? { ...m, ...updates } as Milestone : m)
          );
          setUpdating(null);
        },
      },
    ]);
  };

  const handleUploadPhoto = async (milestone: Milestone) => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
    });
    if (result.didCancel || !result.assets || !result.assets[0]) return;

    const asset = result.assets[0];
    const ext = (asset.uri ?? '').split('.').pop() ?? 'jpg';
    const path = `milestones/${milestone.id}/progress-${Date.now()}.${ext}`;

    const response = await fetch(asset.uri ?? '');
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from('project-photos')
      .upload(path, blob, { contentType: `image/${ext}` });

    if (error) {
      Alert.alert('Upload failed', error.message);
    } else {
      ReactNativeHapticFeedback.trigger('notificationSuccess');
      Alert.alert('Photo uploaded', 'Progress photo saved successfully.');
    }
  };

  const totalPaid = milestones.filter((m) => m.status === 'paid').reduce((s, m) => s + m.amount, 0);
  const totalAmount = milestones.reduce((s, m) => s + m.amount, 0);
  const progressPct = totalAmount > 0 ? totalPaid / totalAmount : 0;

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.title}>Milestones</Text>
            <View style={{ width: 48 }} />
          </View>

          <TradeMetricStrip
            items={[
              { label: 'Milestones', value: milestones.length, tone: 'muted' },
              { label: 'Total', value: totalAmount ? formatCad(totalAmount) : '$0', tone: totalAmount ? 'success' : 'muted' },
              { label: 'Paid', value: formatCad(totalPaid), tone: totalPaid ? 'success' : 'muted' },
            ]}
          />

          {/* Escrow progress */}
          {totalAmount > 0 && (
            <TradePanel style={styles.card}>
              <Text style={styles.sectionLabel}>Payments Received</Text>
              <Text style={styles.escrowAmount}>
                {formatCad(totalPaid)} <Text style={styles.escrowTotal}>of {formatCad(totalAmount)}</Text>
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
              </View>
            </TradePanel>
          )}

          {/* Milestone list */}
          {milestones.map((m, i) => {
            const canAdvance = !!STATUS_NEXT[m.status];
            const isUpdating = updating === m.id;

            return (
              <TradePanel key={m.id} style={styles.milestoneCard}>
                <View style={styles.milestoneHeader}>
                  <View style={styles.stepDot}>
                    <Text style={styles.stepNum}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.milestoneTitle}>{m.title}</Text>
                    {m.due_date && (
                      <Text style={styles.dueDate}>
                        Due {new Date(m.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <View style={styles.milestoneRight}>
                    <Text style={styles.milestoneAmount}>{formatCad(m.amount)}</Text>
                    <StatusBadge label={formatStatusLabel(m.status)} variant={statusVariant(m.status)} size="sm" />
                  </View>
                </View>

                {m.status === 'homeowner_approved' && (
                  <View style={styles.approvedBanner}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="check-circle-outline" size={14} color={Colors.success} />
                      <Text style={styles.approvedText}>Homeowner approved — payment processing</Text>
                    </View>
                  </View>
                )}

                {m.status === 'paid' && (
                  <View style={styles.paidBanner}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="check-decagram" size={14} color={Colors.success} />
                      <Text style={styles.paidText}>Payment received</Text>
                    </View>
                  </View>
                )}

                {canAdvance && (
                  <View style={styles.milestoneActions}>
                    <GlassButton
                      label={STATUS_LABEL[m.status] ?? 'Update'}
                      onPress={() => handleAdvanceStatus(m)}
                      loading={isUpdating}
                      size="sm"
                      haptic
                      style={styles.actionBtn}
                    />
                    <GlassButton
                      label="Photo"
                      icon={<Icon name="camera-outline" size={16} color={Colors.text.primary} />}
                      onPress={() => handleUploadPhoto(m)}
                      variant="secondary"
                      size="sm"
                      style={styles.actionBtn}
                    />
                  </View>
                )}

                {m.status === 'completed' && (
                  <Text style={styles.waitingText}>Waiting for homeowner approval…</Text>
                )}
              </TradePanel>
            );
          })}

          {loading && (
            <View style={styles.center}>
              <Text style={Typography.bodySecondary}>Loading milestones…</Text>
            </View>
          )}

          {!loading && milestones.length === 0 && (
            <TradeEmptyState
              icon="clipboard-text-outline"
              title="No milestones yet"
              body="Submit or accept a quote to create project milestones."
            />
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  backText: { color: Colors.text.secondary, fontSize: 15, width: 48 },
  title: { ...Typography.h2 },
  card: { marginBottom: Spacing.sm },
  sectionLabel: { ...Typography.label, marginBottom: 8 },
  escrowAmount: { fontSize: 28, fontWeight: '700', color: Colors.text.primary, marginBottom: 12 },
  escrowTotal: { fontSize: 16, fontWeight: '400', color: Colors.text.secondary },
  progressTrack: {
    height: 6, backgroundColor: Colors.glass.border, borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: Colors.success, borderRadius: 3,
  },
  milestoneCard: { marginBottom: 10 },
  milestoneHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1, borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { color: Colors.accent, fontSize: 12, fontWeight: '700' },
  milestoneTitle: { ...Typography.body, marginBottom: 2 },
  dueDate: { ...Typography.caption },
  milestoneRight: { alignItems: 'flex-end', gap: 6 },
  milestoneAmount: { fontSize: 16, fontWeight: '600', color: Colors.text.primary },
  approvedBanner: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.glass.border,
  },
  approvedText: { color: Colors.success, fontSize: 13, fontWeight: '600' },
  paidBanner: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.glass.border,
  },
  paidText: { color: Colors.success, fontSize: 13, fontWeight: '600' },
  milestoneActions: {
    flexDirection: 'row', gap: 8, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.glass.border,
  },
  actionBtn: { flex: 1 },
  waitingText: {
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: Colors.glass.border,
    color: Colors.text.secondary, fontSize: 13,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyIcon: { fontSize: 48 },
});
