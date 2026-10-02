import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { formatTradeLabel } from '@/lib/trade-labels';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, ListItemSkeleton } from '@/components/ui';

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

interface MasterTrade {
  id: string;
  trade_type: string | null;
  status: string | null;
  payout_status: string | null;
  completion_submitted_at: string | null;
  stripe_transfer_id: string | null;
  work_order: number | null;
  company_name: string | null;
  evidence_urls: string[];
}

function evidenceUrlsForSlot(
  slotId: string,
  projectPhotos: ProjectPhotoEvidence[],
  messages: MessageEvidence[],
  projectId: string,
) {
  const pathPrefix = `${projectId}/slots/${slotId}/`;
  const photoUrls = projectPhotos
    .filter((photo) => typeof photo.storage_path === 'string' && photo.storage_path.startsWith(pathPrefix) && photo.url)
    .map((photo) => photo.url);
  const messageUrls = messages
    .filter((message) => (
      typeof message.body === 'string'
      && message.body.includes(`[slot:${slotId}]`)
      && typeof message.attachment_url === 'string'
      && message.attachment_url.length > 0
    ))
    .map((message) => message.attachment_url as string);
  return Array.from(new Set([...photoUrls, ...messageUrls]));
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MilestonesScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [activeDisputes, setActiveDisputes] = useState<ActiveDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [disputeTrade, setDisputeTrade] = useState<MasterTrade | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [openingDispute, setOpeningDispute] = useState(false);
  const [selectedEvidencePhoto, setSelectedEvidencePhoto] = useState<string | null>(null);

  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [masterTrades, setMasterTrades] = useState<MasterTrade[]>([]);
  const [adminPaused, setAdminPaused] = useState(false);
  const hasLoadedRef = useRef(false);

  const fetchMilestones = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      if (!projectId) {
        setEmptyMessage('Project is missing. Reopen milestones from the project page.');
        setLoading(false);
        return;
      }

      const [slotsResult, disputesResult, photoEvidenceResult, messageEvidenceResult, projectResult] = await Promise.all([
        supabase
          .from('project_slots')
          .select('id, trade_type, status, payout_status, completion_submitted_at, stripe_transfer_id, work_order, companies(name)')
          .eq('project_id', projectId)
          .order('work_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),
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
          .like('storage_path', `${projectId}/slots/%`),
        supabase
          .from('messages')
          .select('body, attachment_url')
          .eq('project_id', projectId)
          .not('attachment_url', 'is', null)
          .ilike('body', '%[slot:%'),
        supabase
          .from('projects')
          .select('admin_paused')
          .eq('id', projectId)
          .maybeSingle(),
      ]);
      const masterLoadError =
        slotsResult.error ??
        disputesResult.error ??
        photoEvidenceResult.error ??
        messageEvidenceResult.error ??
        (projectResult.error && !/admin_paused/i.test(projectResult.error.message) ? projectResult.error : null);
      if (masterLoadError) throw masterLoadError;

      const photoRows = (photoEvidenceResult.data ?? []) as ProjectPhotoEvidence[];
      const messageRows = (messageEvidenceResult.data ?? []) as MessageEvidence[];
      const trades: MasterTrade[] = ((slotsResult.data ?? []) as any[]).map((s) => {
        const company = Array.isArray(s.companies) ? s.companies[0] : s.companies;
        return {
          id: s.id,
          trade_type: s.trade_type ?? null,
          status: s.status ?? null,
          payout_status: s.payout_status ?? null,
          completion_submitted_at: s.completion_submitted_at ?? null,
          stripe_transfer_id: s.stripe_transfer_id ?? null,
          work_order: s.work_order ?? null,
          company_name: company?.name ?? null,
          evidence_urls: evidenceUrlsForSlot(s.id, photoRows, messageRows, projectId),
        };
      });

      setMasterTrades(trades);
      setActiveDisputes((disputesResult.data ?? []) as ActiveDispute[]);
      setAdminPaused(!!projectResult.data?.admin_paused);
      setEmptyMessage(trades.length === 0 ? 'No trades on this project yet.' : null);
      hasLoadedRef.current = true;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_slots', filter: `project_id=eq.${projectId}` }, fetchMilestones)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'disputes', filter: `project_id=eq.${projectId}` }, fetchMilestones)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_photos', filter: `project_id=eq.${projectId}` }, fetchMilestones)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` }, fetchMilestones)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMilestones, projectId]);

  const handleApproveTrade = async (trade: MasterTrade) => {
    if (adminPaused) {
      Alert.alert('Payment held', 'Walker AI admin has restricted payouts on this project. Contact support to release the hold.');
      return;
    }
    if (activeDisputes.length > 0) {
      Alert.alert('Dispute open', 'Payment release is paused until the active dispute is resolved.');
      return;
    }
    Alert.alert(
      'Approve this trade?',
      "This confirms the work is complete and releases this trade's payment from escrow. This cannot be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Release',
          style: 'destructive',
          onPress: async () => {
            setReleasing(trade.id);
            try {
              const { error } = await supabase.functions.invoke('release-trade-payout', {
                body: { slot_id: trade.id },
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

  const handleOpenTradeDispute = (trade: MasterTrade) => {
    setDisputeTrade(trade);
    setDisputeReason('');
  };

  const closeDisputeModal = () => {
    setDisputeTrade(null);
  };

  const handleSubmitDispute = async () => {
    const rawReason = disputeReason.trim();
    if (!projectId || !disputeTrade) {
      Alert.alert('Missing item', 'Reopen this screen from the project page and try again.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before opening a dispute.');
      return;
    }
    if (rawReason.length < 12) {
      Alert.alert('Add details', 'Please describe what needs review before opening a dispute.');
      return;
    }

    // Master-quote disputes are project-level (no milestone); tag the trade in the
    // reason so it's identifiable. A project-level open dispute pauses all releases.
    const reason = `[trade:${disputeTrade.trade_type ?? 'trade'}] ${rawReason}`;

    setOpeningDispute(true);
    try {
      const { error } = await supabase.from('disputes').insert({
        project_id: projectId,
        milestone_id: null,
        raised_by: user.id,
        reason,
        status: 'open',
      });
      if (error) throw error;
      ReactNativeHapticFeedback.trigger('notificationWarning');
      setDisputeTrade(null);
      setDisputeReason('');
      await fetchMilestones();
    } catch (err) {
      Alert.alert('Could not open dispute', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setOpeningDispute(false);
    }
  };

  const hasActiveDispute = activeDisputes.length > 0;
  const releaseBlocked = hasActiveDispute || adminPaused;
  const tradePaidCount = masterTrades.filter((t) => t.payout_status === 'paid' || t.stripe_transfer_id).length;
  const tradeIsPaid = (t: MasterTrade) => t.payout_status === 'paid' || !!t.stripe_transfer_id;
  // Sequential: a trade is unlocked only once every earlier-ordered trade is paid.
  const isTradeUnlocked = (trade: MasterTrade) =>
    trade.work_order == null
      ? true
      : masterTrades.every((t) => t.work_order == null || t.work_order >= (trade.work_order as number) || tradeIsPaid(t));

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.backText} onPress={() => navigation.goBack()}>← Back</Text>
            <Text style={styles.title}>Approve Work</Text>
          </View>

            <GlassCard style={styles.escrowCard}>
              <Text style={styles.escrowLabel}>Trades Approved</Text>
              <Text style={styles.escrowAmount}>
                {tradePaidCount} <Text style={styles.escrowOf}>of {masterTrades.length} trades</Text>
              </Text>
              <Text style={{ ...Typography.caption, marginTop: 6 }}>
                Approve each trade after they finish. Their payment is released from escrow only when you approve.
              </Text>
            </GlassCard>

            {adminPaused && (
              <GlassCard style={styles.disputeCard}>
                <Text style={styles.disputeTitle}>Admin payment hold</Text>
                <Text style={styles.disputeBody}>
                  Walker AI admin has restricted payouts on this project. Contact support to release the hold.
                </Text>
              </GlassCard>
            )}

            {hasActiveDispute && (
              <GlassCard style={styles.disputeCard}>
                <Text style={styles.disputeTitle}>Payment release paused</Text>
                <Text style={styles.disputeBody}>
                  An active dispute is open for this project. Trade payments can resume after it's resolved.
                </Text>
                <Text style={styles.disputeReason} numberOfLines={3}>{activeDisputes[0]?.reason}</Text>
              </GlassCard>
            )}

            {emptyMessage && !loading && (
              <GlassCard style={{ marginBottom: Spacing.md }}>
                <Text style={{ ...Typography.bodySecondary, lineHeight: 22 }}>{emptyMessage}</Text>
              </GlassCard>
            )}

            {loading
              ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} style={{ marginBottom: 10 }} />)
              : masterTrades.map((trade) => {
                  const isPaid = trade.payout_status === 'paid' || !!trade.stripe_transfer_id;
                  const isApproved = trade.payout_status === 'approved';
                  const submitted = !!trade.completion_submitted_at;
                  const hasEvidence = trade.evidence_urls.length > 0;
                  const unlocked = isTradeUnlocked(trade);
                  const readyForReview = submitted && !isPaid && !isApproved && unlocked;
                  const canApprove = readyForReview && !releaseBlocked && hasEvidence;
                  const statusLabel = isPaid ? 'paid' : isApproved ? 'approved' : !unlocked ? 'waiting' : submitted ? 'ready for approval' : 'in progress';
                  const statusVariant = isPaid ? 'completed' : isApproved ? 'approved' : !unlocked ? 'neutral' : submitted ? 'warning' : 'info';

                  return (
                    <GlassCard key={trade.id} style={styles.milestoneCard}>
                      <View style={styles.milestoneContent}>
                        <View style={styles.milestoneHeader}>
                          <View style={styles.milestoneTitleWrap}>
                            <Text style={styles.milestoneTitle} numberOfLines={2}>{formatTradeLabel(trade.trade_type) ?? 'Trade'}</Text>
                            {trade.company_name ? (
                              <Text style={styles.companyName} numberOfLines={1}>{trade.company_name}</Text>
                            ) : null}
                          </View>
                          <StatusBadge label={statusLabel} variant={statusVariant as any} size="sm" style={styles.milestoneStatusBadge} />
                        </View>

                        {trade.evidence_urls.length > 0 && (
                          <View style={styles.evidenceSection}>
                            <Text style={styles.evidenceLabel}>Completion photos</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evidenceList}>
                              {trade.evidence_urls.map((url) => (
                                <TouchableOpacity
                                  key={url}
                                  activeOpacity={0.88}
                                  onPress={() => setSelectedEvidencePhoto(url)}
                                >
                                  <Image source={{ uri: url }} style={styles.evidenceImage} resizeMode="cover" />
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}

                        {readyForReview && !hasEvidence && (
                          <Text style={styles.missingEvidence}>
                            Completion photos are missing. Ask the contractor to upload proof before approving.
                          </Text>
                        )}

                        {readyForReview && (
                          <View style={styles.reviewActions}>
                            <GlassButton
                              label={releaseBlocked ? 'Release Paused' : hasEvidence ? 'Approve & Release Payment' : 'Awaiting Photos'}
                              onPress={() => handleApproveTrade(trade)}
                              loading={releasing === trade.id}
                              disabled={!canApprove}
                              fullWidth
                              size="sm"
                              style={styles.approveBtn}
                              haptic
                            />
                            {!releaseBlocked && (
                              <GlassButton
                                label="Report Issue"
                                onPress={() => handleOpenTradeDispute(trade)}
                                variant="destructive"
                                fullWidth
                                size="sm"
                              />
                            )}
                          </View>
                        )}

                        {!unlocked && !isPaid && !isApproved && (
                          <Text style={styles.paidNote}>Waiting for earlier trades to finish…</Text>
                        )}

                        {unlocked && !submitted && !isPaid && !isApproved && (
                          <Text style={styles.paidNote}>Up next — waiting for the contractor to finish and submit photos…</Text>
                        )}

                        {isPaid && <Text style={styles.paidNote}>✓ Payment released</Text>}
                        {isApproved && <Text style={styles.paidNote}>Approved — payment processing</Text>}
                      </View>
                    </GlassCard>
                  );
                })}
          </ScrollView>

          <Modal
            visible={!!disputeTrade}
            transparent
            animationType="fade"
            onRequestClose={closeDisputeModal}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Report an issue</Text>
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
                  <GlassButton label="Cancel" onPress={closeDisputeModal} variant="secondary" size="sm" style={styles.modalButton} />
                  <GlassButton label="Open Dispute" onPress={handleSubmitDispute} variant="destructive" size="sm" loading={openingDispute} style={styles.modalButton} />
                </View>
              </View>
            </View>
          </Modal>

          {/* Full-Screen Evidence Photo Modal */}
          <Modal
            visible={!!selectedEvidencePhoto}
            transparent={false}
            animationType="fade"
            onRequestClose={() => setSelectedEvidencePhoto(null)}
          >
            <View style={styles.fullScreenPhotoContainer}>
              <SafeAreaView style={styles.fullScreenPhotoHeader}>
                <TouchableOpacity
                  style={styles.fullScreenCloseBtn}
                  onPress={() => setSelectedEvidencePhoto(null)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.fullScreenPhotoTitle}>Completion Photo</Text>
                <View style={{ width: 40 }} />
              </SafeAreaView>
              {selectedEvidencePhoto ? (
                <View style={styles.fullScreenPhotoWrapper}>
                  <Image source={{ uri: selectedEvidencePhoto }} style={styles.fullScreenImage} resizeMode="contain" />
                </View>
              ) : null}
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

  // Full-screen Evidence Photo
  fullScreenPhotoContainer: { flex: 1, backgroundColor: '#000' },
  fullScreenPhotoHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 24 : 36,
  },
  fullScreenCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenPhotoTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  fullScreenPhotoWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  fullScreenImage: { width: SCREEN_WIDTH, height: '100%' },
});
