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
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { companyEstimatedNetPayoutCents } from '@/lib/company-payouts';
import { formatCadCents } from '@/lib/currency';
import { getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { formatStatusLabel } from '@/lib/formatters';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GradientBackground, StatusBadge } from '@/components/ui';
import { TradeEmptyState, TradeMetricStrip, TradePanel } from '@/components/company/TradeUI';

interface Milestone {
  id: string;
  title: string;
  amount: number;
  commission_rate: number | null;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface QuoteSummary {
  id: string;
  status: string | null;
  submitted_at: string | null;
  commission_rate?: number | null;
  slot_id?: string | null;
}

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
  return formatCadCents(cents);
}

function statusVariant(status: string): 'pending' | 'active' | 'completed' | 'paid' {
  if (status === 'paid') return 'paid';
  if (status === 'homeowner_approved') return 'completed';
  if (status === 'completed') return 'completed';
  if (status === 'in_progress' || status === 'started') return 'active';
  return 'pending';
}

function isReleasedMilestone(status: string) {
  return status === 'paid' || status === 'homeowner_approved';
}

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message;
  if (!message) return false;
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
}

function isPolicyError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === '42501'
    || message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('violates row-level security policy');
}

async function hasMilestoneProgressEvidence(projectId: string, milestoneId: string): Promise<boolean> {
  const [photoResult, messageResult] = await Promise.all([
    supabase
      .from('project_photos')
      .select('id')
      .eq('project_id', projectId)
      .like('storage_path', `${projectId}/milestones/${milestoneId}/%`)
      .limit(1),
    supabase
      .from('messages')
      .select('id')
      .eq('project_id', projectId)
      .not('attachment_url', 'is', null)
      .ilike('body', `%milestone:${milestoneId}%`)
      .limit(1),
  ]);

  if (photoResult.error) throw photoResult.error;
  if (messageResult.error) throw messageResult.error;
  return (photoResult.data?.length ?? 0) > 0 || (messageResult.data?.length ?? 0) > 0;
}

export default function CompanyMilestonesScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const slotId: string | undefined = route.params?.slot;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchMilestones = useCallback(async () => {
    if (!projectId || !user?.id) {
      setMilestones([]);
      setLoading(false);
      return;
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (companyError) {
      Alert.alert('Error', companyError.message);
      setLoading(false);
      return;
    }

    if (!company) {
      setMilestones([]);
      setLoading(false);
      return;
    }

    let quoteResult: any = await supabase
      .from('quotes')
      .select('id, status, submitted_at, commission_rate, slot_id')
      .eq('project_id', projectId)
      .eq('company_id', company.id)
      .order('submitted_at', { ascending: false });

    if (isMissingColumnError(quoteResult.error)) {
      quoteResult = await supabase
        .from('quotes')
        .select('id, status, submitted_at, commission_rate')
        .eq('project_id', projectId)
        .eq('company_id', company.id)
        .order('submitted_at', { ascending: false });
    }

    if (quoteResult.error) {
      Alert.alert('Error', quoteResult.error.message);
      setLoading(false);
      return;
    }

    const scopedQuotes = ((quoteResult.data ?? []) as QuoteSummary[]).filter((q) => {
      if (!slotId || !('slot_id' in q)) return true;
      return q.slot_id === slotId;
    });

    const quoteData = scopedQuotes.find((q) => q.status === 'approved');

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

    setMilestones(((data ?? []) as Omit<Milestone, 'commission_rate'>[]).map((milestone) => ({
      ...milestone,
      commission_rate: quoteData.commission_rate ?? null,
    })));
    setLoading(false);
  }, [projectId, slotId, user?.id]);

  useEffect(() => {
    fetchMilestones();
    if (!projectId) return;

    const channel = supabase
      .channel(`company-milestones:${projectId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'milestones',
      }, () => fetchMilestones())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMilestones, projectId]);

  const handleAdvanceStatus = async (milestone: Milestone) => {
    if (!projectId) {
      Alert.alert('Missing project', 'Reopen milestones from the job page and try again.');
      return;
    }
    const currentProjectId = projectId;
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
          try {
            if (isComplete) {
              const hasEvidence = await hasMilestoneProgressEvidence(currentProjectId, milestone.id);
              if (!hasEvidence) {
                throw new Error('Upload at least one progress photo for this milestone before marking it complete.');
              }
            }

            const updates: Record<string, unknown> = { status: nextStatus };
            if (isComplete) updates.completed_at = new Date().toISOString();

            const { data: updatedMilestone, error } = await supabase
              .from('milestones')
              .update(updates)
              .eq('id', milestone.id)
              .select('id')
              .maybeSingle();
            if (error) throw error;
            if (!updatedMilestone) throw new Error('Milestone is no longer available.');

            if (isComplete) {
              const { data: project, error: projectError } = await supabase
                .from('projects')
                .select('homeowner_id')
                .eq('id', currentProjectId)
                .maybeSingle();
              if (projectError) throw projectError;
              if (!project) throw new Error('Project not found while notifying homeowner.');

              const { error: notificationError } = await supabase.from('notifications').insert({
                user_id: project.homeowner_id,
                type: 'milestone_needs_approval',
                payload: {
                  project_id: currentProjectId,
                  milestone_id: milestone.id,
                  milestone_title: milestone.title,
                  amount: milestone.amount,
                  deep_link: `/(homeowner)/project/${currentProjectId}/milestones`,
                },
              });
              if (notificationError) {
                console.warn('milestone_needs_approval notification failed:', notificationError);
              }
            }

            ReactNativeHapticFeedback.trigger('notificationSuccess');
            setMilestones((prev) =>
              prev.map((m) => m.id === milestone.id ? { ...m, ...updates } as Milestone : m)
            );
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update milestone.');
          } finally {
            setUpdating(null);
          }
        },
      },
    ]);
  };

  const handleUploadPhoto = async (milestone: Milestone) => {
    if (!projectId) {
      Alert.alert('Missing project', 'Reopen milestones from the job page and try again.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before uploading progress photos.');
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
      assetRepresentationMode: 'compatible',
    });
    if (result.didCancel || !result.assets || !result.assets[0]) return;

    try {
      const upload = getUploadMetadata(result.assets[0]);
      const path = `${projectId}/milestones/${milestone.id}/progress-${Date.now()}.${upload.extension}`;
      const { publicUrl, storagePath } = await uploadFile(
        'project-photos',
        path,
        upload.uri,
        upload.contentType
      );

      const { error } = await supabase.from('project_photos').insert({
        project_id: projectId,
        url: publicUrl,
        storage_path: storagePath,
      });
      if (error) {
        if (!isPolicyError(error)) throw error;

        const { error: messageError } = await supabase.from('messages').insert({
          project_id: projectId,
          sender_id: user.id,
          body: `[milestone:${milestone.id}] Progress photo uploaded for "${milestone.title}": ${publicUrl}`,
          attachment_url: publicUrl,
        });

        if (messageError) {
          throw new Error(`Photo uploaded, but WalkerAI could not save the progress record (${error.message}) or send it in messages (${messageError.message}).`);
        }

        ReactNativeHapticFeedback.trigger('notificationSuccess');
        Alert.alert(
          'Photo sent in messages',
          'This environment needs the company progress-photo policy migration before contractor uploads can appear in project photos. The photo was sent to the homeowner in the project message thread instead.'
        );
        return;
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      Alert.alert('Photo uploaded', 'Progress photo saved successfully.');
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const netPayout = (milestone: Milestone) => companyEstimatedNetPayoutCents(milestone.amount, milestone.commission_rate);
  const netPaid = milestones.filter((m) => isReleasedMilestone(m.status)).reduce((s, m) => s + netPayout(m), 0);
  const netTotal = milestones.reduce((s, m) => s + netPayout(m), 0);
  const progressPct = netTotal > 0 ? netPaid / netTotal : 0;

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
              { label: 'Net total', value: netTotal ? formatCad(netTotal) : '$0.00', tone: netTotal ? 'success' : 'muted' },
              { label: 'Net paid', value: formatCad(netPaid), tone: netPaid ? 'success' : 'muted' },
            ]}
          />

          {/* Escrow progress */}
          {netTotal > 0 && (
            <TradePanel style={styles.card}>
              <Text style={styles.sectionLabel}>Net Payments Received</Text>
              <Text style={styles.escrowAmount}>
                {formatCad(netPaid)} <Text style={styles.escrowTotal}>of {formatCad(netTotal)}</Text>
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
              </View>
            </TradePanel>
          )}

          {/* Milestone list */}
          {milestones.map((m, i) => {
            const canAdvance = !!STATUS_NEXT[m.status];
            const canUploadPhoto = !isReleasedMilestone(m.status);
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
                    <Text style={styles.milestoneAmount}>{formatCad(netPayout(m))}</Text>
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

                {(canAdvance || canUploadPhoto) && (
                  <View style={styles.milestoneActions}>
                    {canAdvance && (
                      <GlassButton
                        label={STATUS_LABEL[m.status] ?? 'Update'}
                        onPress={() => handleAdvanceStatus(m)}
                        loading={isUpdating}
                        size="sm"
                        haptic
                        style={styles.actionBtn}
                      />
                    )}
                    {canUploadPhoto && (
                      <GlassButton
                        label="Photo"
                        icon={<Icon name="camera-outline" size={16} color={Colors.text.primary} />}
                        onPress={() => handleUploadPhoto(m)}
                        variant="secondary"
                        size="sm"
                        style={styles.actionBtn}
                      />
                    )}
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
              body="Milestones appear here after the homeowner funds your quote."
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
