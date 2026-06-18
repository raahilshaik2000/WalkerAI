import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { formatCadCents } from '@/lib/currency';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
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
  quote_id: string;
  company_name: string | null;
  evidence_urls: string[];
}

interface QuoteWithMilestones {
  id: string;
  approved_at: string | null;
  submitted_at: string | null;
  companies?: { name: string | null } | Array<{ name: string | null }> | null;
  milestones?: Array<Omit<Milestone, 'quote_id' | 'company_name'>>;
}

interface ActiveDispute {
  id: string;
  milestone_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

interface ProjectPhotoEvidence {
  url: string;
  storage_path: string | null;
}

interface MessageEvidence {
  body: string | null;
  attachment_url: string | null;
}

function formatCad(cents: number) {
  return formatCadCents(cents);
}

const MILESTONE_STATUS_VARIANT: Record<string, any> = {
  pending: 'neutral',
  started: 'info',
  in_progress: 'dispatching',
  completed: 'warning',
  homeowner_approved: 'approved',
  paid: 'completed',
};

function isReleasedMilestone(status: string) {
  return status === 'paid' || status === 'homeowner_approved';
}

function evidenceUrlsForMilestone(
  milestoneId: string,
  projectPhotos: ProjectPhotoEvidence[],
  messages: MessageEvidence[],
  projectId: string,
) {
  const pathPrefix = `${projectId}/milestones/${milestoneId}/`;
  const photoUrls = projectPhotos
    .filter((photo) => typeof photo.storage_path === 'string' && photo.storage_path.startsWith(pathPrefix) && photo.url)
    .map((photo) => photo.url);
  const messageUrls = messages
    .filter((message) => (
      typeof message.body === 'string'
      && message.body.includes(`[milestone:${milestoneId}]`)
      && typeof message.attachment_url === 'string'
      && message.attachment_url.length > 0
    ))
    .map((message) => message.attachment_url as string);

  return Array.from(new Set([...photoUrls, ...messageUrls]));
}

export default function MilestonesScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [activeDisputes, setActiveDisputes] = useState<ActiveDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [disputeMilestone, setDisputeMilestone] = useState<Milestone | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [openingDispute, setOpeningDispute] = useState(false);

  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);

  const fetchMilestones = useCallback(async () => {
    setLoading(true);
    try {
      if (!projectId) {
        setMilestones([]);
        setEmptyMessage('Project is missing. Reopen milestones from the project page.');
        setLoading(false);
        return;
      }

      const [quotesResult, disputesResult, photoEvidenceResult, messageEvidenceResult] = await Promise.all([
        supabase
          .from('quotes')
          .select(`
            id, approved_at, submitted_at,
            companies(name),
            milestones(id, title, amount, status, sort_order, due_date, completed_at, stripe_transfer_id)
          `)
          .eq('project_id', projectId)
          .eq('status', 'approved')
          .order('approved_at', { ascending: false })
          .order('submitted_at', { ascending: false }),
        supabase
          .from('disputes')
          .select('id, milestone_id, reason, status, created_at')
          .eq('project_id', projectId)
          .in('status', ['open', 'under_review'])
          .order('created_at', { ascending: false }),
        supabase
          .from('project_photos')
          .select('url, storage_path')
          .eq('project_id', projectId)
          .like('storage_path', `${projectId}/milestones/%`),
        supabase
          .from('messages')
          .select('body, attachment_url')
          .eq('project_id', projectId)
          .not('attachment_url', 'is', null)
          .ilike('body', '%[milestone:%'),
      ]);
      const loadError = quotesResult.error ?? disputesResult.error ?? photoEvidenceResult.error ?? messageEvidenceResult.error;
      if (loadError) throw loadError;

      const approvedQuotes = (quotesResult.data ?? []) as unknown as QuoteWithMilestones[];
      const photoEvidenceRows = (photoEvidenceResult.data ?? []) as ProjectPhotoEvidence[];
      const messageEvidenceRows = (messageEvidenceResult.data ?? []) as MessageEvidence[];
      const flattened = approvedQuotes.flatMap((quote) => {
        const company = Array.isArray(quote.companies) ? quote.companies[0] : quote.companies;
        return [...(quote.milestones ?? [])]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((milestone) => ({
            ...milestone,
            quote_id: quote.id,
            company_name: company?.name ?? null,
            evidence_urls: evidenceUrlsForMilestone(milestone.id, photoEvidenceRows, messageEvidenceRows, projectId),
          }));
      });

      setMilestones(flattened);
      setActiveDisputes((disputesResult.data ?? []) as ActiveDispute[]);
      setEmptyMessage(flattened.length === 0
        ? 'No approved quote yet. Milestones will appear after you approve contractor quotes.'
        : null);
    } catch (err) {
      Alert.alert('Could not load milestones', formatAppSafeErrorMessage(err, 'Please try again.'));
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchMilestones();
    if (!projectId) return;
    const channel = supabase
      .channel(`milestones:${projectId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'milestones' }, fetchMilestones)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes', filter: `project_id=eq.${projectId}` }, fetchMilestones)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_photos', filter: `project_id=eq.${projectId}` }, fetchMilestones)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` }, fetchMilestones)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMilestones, projectId]);

  const handleApprove = async (milestoneId: string) => {
    if (activeDisputes.length > 0) {
      Alert.alert('Dispute open', 'Payment release is paused until the active dispute is resolved.');
      return;
    }

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
              const { error } = await supabase.functions.invoke('release-milestone', {
                body: { milestone_id: milestoneId },
              });
              if (error) throw new Error(await formatSupabaseFunctionError(error));
              ReactNativeHapticFeedback.trigger('notificationSuccess');
              await fetchMilestones();
            } catch (err) {
              Alert.alert('Release failed', await formatSupabaseFunctionError(err, 'Please try again.'));
            } finally {
              setReleasing(null);
            }
          },
        },
      ]
    );
  };

  const handleOpenDispute = (milestone: Milestone) => {
    setDisputeMilestone(milestone);
    setDisputeReason('');
  };

  const handleSubmitDispute = async () => {
    const reason = disputeReason.trim();
    if (!projectId || !disputeMilestone) {
      Alert.alert('Missing milestone', 'Reopen milestones from the project page and try again.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before opening a dispute.');
      return;
    }
    if (reason.length < 12) {
      Alert.alert('Add details', 'Please describe what needs review before opening a dispute.');
      return;
    }

    setOpeningDispute(true);
    try {
      const { error } = await supabase.from('disputes').insert({
        project_id: projectId,
        milestone_id: disputeMilestone.id,
        raised_by: user.id,
        reason,
        status: 'open',
      });
      if (error) throw error;
      ReactNativeHapticFeedback.trigger('notificationWarning');
      setDisputeMilestone(null);
      setDisputeReason('');
      await fetchMilestones();
    } catch (err) {
      Alert.alert('Could not open dispute', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setOpeningDispute(false);
    }
  };

  const totalAmount = milestones.reduce((s, m) => s + m.amount, 0);
  const paidAmount = milestones.filter((m) => isReleasedMilestone(m.status)).reduce((s, m) => s + m.amount, 0);
  const progressPct = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
  const hasActiveDispute = activeDisputes.length > 0;

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

          {hasActiveDispute && (
            <GlassCard style={styles.disputeCard}>
              <Text style={styles.disputeTitle}>Payment release paused</Text>
              <Text style={styles.disputeBody}>
                An active dispute is open for this project. Milestone payments can resume after the dispute is resolved.
              </Text>
              <Text style={styles.disputeReason} numberOfLines={3}>
                {activeDisputes[0]?.reason}
              </Text>
            </GlassCard>
          )}

          {emptyMessage && !loading && (
            <GlassCard style={{ marginBottom: Spacing.md }}>
              <Text style={{ ...Typography.bodySecondary, lineHeight: 22 }}>{emptyMessage}</Text>
            </GlassCard>
          )}

          {loading
            ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} style={{ marginBottom: 10 }} />)
            : milestones.map((milestone, index) => {
                const isReadyForReview = milestone.status === 'completed' && !milestone.stripe_transfer_id;
                const hasProgressEvidence = milestone.evidence_urls.length > 0;
                const canApprove = isReadyForReview && !hasActiveDispute && hasProgressEvidence;
                const isPaid = isReleasedMilestone(milestone.status);

                return (
                  <GlassCard key={milestone.id} style={styles.milestoneCard}>
                    <View style={styles.milestoneRowLayout}>
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
                          <View style={styles.milestoneTitleWrap}>
                            <Text style={styles.milestoneTitle} numberOfLines={2}>{milestone.title}</Text>
                            {milestone.company_name ? (
                              <Text style={styles.companyName} numberOfLines={1}>{milestone.company_name}</Text>
                            ) : null}
                          </View>
                          <StatusBadge
                            label={milestone.status.replace('_', ' ')}
                            variant={MILESTONE_STATUS_VARIANT[milestone.status]}
                            size="sm"
                            style={styles.milestoneStatusBadge}
                          />
                        </View>

                      <Text style={styles.milestoneAmount}>{formatCad(milestone.amount)}</Text>

                      {milestone.due_date && (
                        <Text style={styles.dueDate}>
                          Due {new Date(milestone.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                        </Text>
                      )}

                      {milestone.evidence_urls.length > 0 && (
                        <View style={styles.evidenceSection}>
                          <Text style={styles.evidenceLabel}>Progress evidence</Text>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.evidenceList}
                          >
                            {milestone.evidence_urls.map((url) => (
                              <Image
                                key={url}
                                source={{ uri: url }}
                                style={styles.evidenceImage}
                                resizeMode="cover"
                              />
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {isReadyForReview && !hasProgressEvidence && (
                        <Text style={styles.missingEvidence}>
                          Progress photo evidence is missing. Ask the contractor to upload proof before approving.
                        </Text>
                      )}

                      {isReadyForReview && (
                        <View style={styles.reviewActions}>
                          <GlassButton
                            label={hasActiveDispute ? 'Release Paused' : hasProgressEvidence ? 'Approve & Release Payment' : 'Awaiting Progress Proof'}
                            onPress={() => handleApprove(milestone.id)}
                            loading={releasing === milestone.id}
                            disabled={!canApprove}
                            fullWidth
                            size="sm"
                            style={styles.approveBtn}
                            haptic
                          />
                          {!hasActiveDispute && (
                            <GlassButton
                              label="Report Issue"
                              onPress={() => handleOpenDispute(milestone)}
                              variant="destructive"
                              fullWidth
                              size="sm"
                            />
                          )}
                        </View>
                      )}

                      {isPaid && (
                        <Text style={styles.paidNote}>✓ Payment released</Text>
                      )}
                      </View>
                    </View>
                  </GlassCard>
                );
              })}
        </ScrollView>

        <Modal
          visible={!!disputeMilestone}
          transparent
          animationType="fade"
          onRequestClose={() => setDisputeMilestone(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Report milestone issue</Text>
              <Text style={styles.modalBody}>
                Explain what needs review. Payment release will pause while the dispute is open.
              </Text>
              <TextInput
                value={disputeReason}
                onChangeText={setDisputeReason}
                placeholder="Describe the issue..."
                placeholderTextColor={Colors.text.tertiary}
                multiline
                style={styles.disputeInput}
              />
              <View style={styles.modalActions}>
                <GlassButton
                  label="Cancel"
                  onPress={() => setDisputeMilestone(null)}
                  variant="secondary"
                  size="sm"
                  style={styles.modalButton}
                />
                <GlassButton
                  label="Open Dispute"
                  onPress={handleSubmitDispute}
                  variant="destructive"
                  size="sm"
                  loading={openingDispute}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>
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
  disputeCard: { marginBottom: Spacing.md, borderColor: 'rgba(224,11,11,0.3)' },
  disputeTitle: { ...Typography.h3, color: Colors.error, marginBottom: 6 },
  disputeBody: { ...Typography.bodySecondary, lineHeight: 20, marginBottom: 8 },
  disputeReason: { ...Typography.caption, color: Colors.text.primary },
  milestoneCard: { marginBottom: 10 },
  milestoneRowLayout: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  stepRow: { width: 28, flexShrink: 0, alignItems: 'center', paddingTop: 2 },
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
  milestoneContent: { flex: 1, minWidth: 0 },
  milestoneHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  milestoneTitleWrap: { flex: 1, minWidth: 0 },
  milestoneTitle: { ...Typography.h3, lineHeight: 22 },
  companyName: { ...Typography.caption, marginTop: 2 },
  milestoneStatusBadge: { flexShrink: 0 },
  milestoneAmount: { fontSize: 20, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  dueDate: { ...Typography.caption, marginBottom: 10 },
  evidenceSection: { marginTop: 4, marginBottom: 10 },
  evidenceLabel: { ...Typography.caption, color: Colors.text.secondary, marginBottom: 8 },
  evidenceList: { gap: 8 },
  evidenceImage: {
    width: 88,
    height: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
  },
  missingEvidence: {
    ...Typography.caption,
    color: Colors.warning,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 8,
  },
  reviewActions: { gap: 8, marginTop: 8 },
  approveBtn: { marginTop: 8 },
  paidNote: { color: Colors.success, fontSize: 13, fontWeight: '600', marginTop: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  modalCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: Spacing.md,
  },
  modalTitle: { ...Typography.h3, marginBottom: 8 },
  modalBody: { ...Typography.bodySecondary, lineHeight: 20, marginBottom: 12 },
  disputeInput: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    color: Colors.text.primary,
    padding: 12,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1 },
});
