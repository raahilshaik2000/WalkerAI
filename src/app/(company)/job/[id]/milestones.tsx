import { useCallback, useEffect, useState, useRef } from 'react';
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatCadCents } from '@/lib/currency';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { pickPhotosWithSource } from '@/lib/media-picker';
import { getUploadMetadata, uploadBase64, uploadFile } from '@/lib/supabase/storage';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GradientBackground, StatusBadge } from '@/components/ui';
import { TradeEmptyState, TradePanel } from '@/components/company/TradeUI';

interface MasterSlotPayout {
  id: string;
  trade_type: string | null;
  status: string | null;
  payout_cents: number | null;
  payout_status: string | null;
  completion_submitted_at: string | null;
  en_route_at: string | null;
  stripe_transfer_id: string | null;
  work_order: number | null;
}

function formatCad(cents: number) {
  return formatCadCents(cents);
}

function isPolicyError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === '42501'
    || message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('violates row-level security policy');
}

async function hasSlotCompletionEvidence(projectId: string, slotId: string): Promise<boolean> {
  const [photoResult, messageResult] = await Promise.all([
    supabase
      .from('project_photos')
      .select('id')
      .eq('project_id', projectId)
      .like('storage_path', `${projectId}/slots/${slotId}/%`)
      .limit(1),
    supabase
      .from('messages')
      .select('id')
      .eq('project_id', projectId)
      .not('attachment_url', 'is', null)
      .ilike('body', `%slot:${slotId}%`)
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
  const [masterSlot, setMasterSlot] = useState<MasterSlotPayout | null>(null);
  const [masterUnlocked, setMasterUnlocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchMilestones = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    if (!projectId || !user?.id) {
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
      Alert.alert('Could not load milestones', formatAppSafeErrorMessage(companyError, 'Please try again.'));
      setLoading(false);
      return;
    }

    if (!company) {
      setLoading(false);
      return;
    }

    if (slotId) {
      const { data: slot, error: slotError } = await supabase
        .from('project_slots')
        .select('id, trade_type, status, payout_cents, payout_status, completion_submitted_at, en_route_at, stripe_transfer_id, work_order')
        .eq('id', slotId)
        .eq('assigned_company_id', company.id)
        .maybeSingle();
      if (slotError) {
        Alert.alert('Could not load payment', formatAppSafeErrorMessage(slotError, 'Please try again.'));
        setLoading(false);
        return;
      }

      // Sequential trades: this slot is unlocked only when every earlier-ordered
      // trade in the project has already been paid.
      let unlocked = true;
      const workOrder = (slot as MasterSlotPayout | null)?.work_order ?? null;
      if (slot && workOrder != null) {
        const { data: priorSlots, error: priorError } = await supabase
          .from('project_slots')
          .select('id, payout_status')
          .eq('project_id', projectId)
          .lt('work_order', workOrder);
        if (priorError) {
          Alert.alert('Could not load payment', formatAppSafeErrorMessage(priorError, 'Please try again.'));
          setLoading(false);
          return;
        }
        unlocked = (priorSlots ?? []).every((s: { payout_status: string | null }) => s.payout_status === 'paid');
      }

      setMasterSlot((slot as MasterSlotPayout) ?? null);
      setMasterUnlocked(unlocked);
      hasLoadedRef.current = true;
      setLoading(false);
      return;
    }
    // No slotId: nothing to show for this master-only screen.
    hasLoadedRef.current = true;
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

  const handleUploadSlotPhoto = async () => {
    if (!projectId || !slotId) {
      Alert.alert('Missing job', 'Reopen this job and try again.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before uploading completion photos.');
      return;
    }

    const assets = await pickPhotosWithSource({
      quality: 0.8,
      selectionLimit: 1,
      includeBase64: true,
    });
    if (!assets?.[0]) return;

    try {
      const upload = getUploadMetadata(assets[0]);
      const path = `${projectId}/slots/${slotId}/completion-${Date.now()}.${upload.extension}`;
      const { publicUrl, storagePath } = assets[0].base64
        ? await uploadBase64('project-photos', path, assets[0].base64, upload.contentType)
        : await uploadFile('project-photos', path, upload.uri, upload.contentType);

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
          body: `[slot:${slotId}] Completion photo uploaded: ${publicUrl}`,
          attachment_url: publicUrl,
        });
        if (messageError) {
          throw new Error(formatAppSafeErrorMessage(
            messageError,
            'Photo uploaded, but WalkerAI could not save the completion record or send it in messages. Please try again.',
          ));
        }
        ReactNativeHapticFeedback.trigger('notificationSuccess');
        Alert.alert(
          'Photo sent in messages',
          'This environment needs the company progress-photo policy migration. The photo was sent to the homeowner in the project message thread instead.'
        );
        return;
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      Alert.alert('Photo uploaded', 'Completion photo saved successfully.');
    } catch (err) {
      Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Please try again.'));
    }
  };

  const handleMarkEnRoute = async () => {
    if (!projectId || !slotId) {
      Alert.alert('Missing job', 'Reopen this job and try again.');
      return;
    }
    setUpdating(`enroute:${slotId}`);
    try {
      // Only the first tap sets the timestamp (is('en_route_at', null)); a repeat
      // tap is a harmless no-op so the homeowner is not notified twice.
      const { error } = await supabase
        .from('project_slots')
        .update({ en_route_at: new Date().toISOString() })
        .eq('id', slotId)
        .is('en_route_at', null);
      if (error) throw error;

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('homeowner_id')
        .eq('id', projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (project?.homeowner_id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: project.homeowner_id,
          type: 'trade_en_route',
          payload: {
            project_id: projectId,
            slot_id: slotId,
            trade_type: masterSlot?.trade_type ?? null,
            deep_link: `/(homeowner)/project/${projectId}`,
          },
        });
        if (notificationError) console.warn('trade_en_route notification failed:', notificationError);
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setMasterSlot((prev) => prev ? { ...prev, en_route_at: new Date().toISOString() } : prev);
    } catch (err) {
      Alert.alert('Could not update', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setUpdating(null);
    }
  };

  const handleMarkSlotComplete = async () => {
    if (!projectId || !slotId) {
      Alert.alert('Missing job', 'Reopen this job and try again.');
      return;
    }
    Alert.alert(
      'Mark trade complete?',
      'The homeowner will be asked to review your photos and approve releasing your payment.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setUpdating(slotId);
            try {
              const hasEvidence = await hasSlotCompletionEvidence(projectId, slotId);
              if (!hasEvidence) {
                throw new Error('Upload at least one completion photo before marking this trade complete.');
              }

              const { data: updatedSlot, error } = await supabase
                .from('project_slots')
                .update({ completion_submitted_at: new Date().toISOString() })
                .eq('id', slotId)
                .select('id')
                .maybeSingle();
              if (error) throw error;
              if (!updatedSlot) throw new Error('This trade is no longer available.');

              const { data: project, error: projectError } = await supabase
                .from('projects')
                .select('homeowner_id')
                .eq('id', projectId)
                .maybeSingle();
              if (projectError) throw projectError;
              if (project?.homeowner_id) {
                const { error: notificationError } = await supabase.from('notifications').insert({
                  user_id: project.homeowner_id,
                  type: 'trade_needs_approval',
                  payload: {
                    project_id: projectId,
                    slot_id: slotId,
                    deep_link: `/(homeowner)/project/${projectId}/milestones`,
                  },
                });
                if (notificationError) console.warn('trade_needs_approval notification failed:', notificationError);
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              setMasterSlot((prev) => prev ? { ...prev, completion_submitted_at: new Date().toISOString() } : prev);
            } catch (err) {
              Alert.alert('Could not mark complete', formatAppSafeErrorMessage(err, 'Please try again.'));
            } finally {
              setUpdating(null);
            }
          },
        },
      ]
    );
  };

  const payout = masterSlot?.payout_cents ?? 0;
  const payoutStatus = masterSlot?.payout_status ?? 'pending';
  const submitted = !!masterSlot?.completion_submitted_at;
  const isPaid = payoutStatus === 'paid' || !!masterSlot?.stripe_transfer_id;
  const isApproved = payoutStatus === 'approved';
  const enRoute = !!masterSlot?.en_route_at;
  const slotUpdating = updating === slotId;
  const enRouteUpdating = updating === `enroute:${slotId}`;
  const badgeVariant: 'pending' | 'active' | 'completed' | 'paid' = isPaid ? 'paid' : isApproved ? 'completed' : 'pending';
  const badgeLabel = isPaid ? 'Paid' : isApproved ? 'Approved' : submitted ? 'Awaiting approval' : 'In progress';

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.title}>Payment</Text>
            <View style={{ width: 48 }} />
          </View>

          {loading && (
            <View style={styles.center}>
              <Text style={Typography.bodySecondary}>Loading…</Text>
            </View>
          )}

          {!loading && !masterSlot && (
            <TradeEmptyState
              icon="cash-remove"
              title="No payout yet"
              body="Your payout appears here once you've accepted this trade."
            />
          )}

          {!loading && masterSlot && (
            <TradePanel style={styles.milestoneCard}>
              <View style={styles.milestoneHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionLabel}>Your Payout</Text>
                  <Text style={styles.escrowAmount}>{formatCad(payout)}</Text>
                </View>
                <StatusBadge label={badgeLabel} variant={badgeVariant} size="sm" />
              </View>

              {isPaid ? (
                <View style={styles.paidBanner}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="check-decagram" size={14} color={Colors.success} />
                    <Text style={styles.paidText}>Payment received</Text>
                  </View>
                </View>
              ) : isApproved ? (
                <View style={styles.approvedBanner}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="check-circle-outline" size={14} color={Colors.success} />
                    <Text style={styles.approvedText}>Homeowner approved — payment processing</Text>
                  </View>
                </View>
              ) : submitted ? (
                <>
                  <Text style={styles.waitingText}>Marked complete — waiting for homeowner approval…</Text>
                  <View style={styles.milestoneActions}>
                    <GlassButton
                      label="Add Photo"
                      icon={<Icon name="camera-outline" size={16} color={Colors.text.primary} />}
                      onPress={handleUploadSlotPhoto}
                      variant="secondary"
                      size="sm"
                      style={styles.actionBtn}
                    />
                  </View>
                </>
              ) : !masterUnlocked ? (
                <Text style={styles.waitingText}>
                  Waiting for earlier trades — you can mark this complete once the previous trade has finished and been paid.
                </Text>
              ) : (
                <>
                  {enRoute ? (
                    <View style={styles.enRouteSent}>
                      <Icon name="car" size={14} color={Colors.success} />
                      <Text style={styles.enRouteSentText}>Homeowner notified you're on the way</Text>
                    </View>
                  ) : (
                    <GlassButton
                      label="I'm on my way"
                      icon={<Icon name="car-outline" size={16} color={Colors.text.primary} />}
                      onPress={handleMarkEnRoute}
                      loading={enRouteUpdating}
                      variant="secondary"
                      size="sm"
                      haptic
                      style={styles.enRouteBtn}
                    />
                  )}
                  <View style={styles.milestoneActions}>
                    <GlassButton
                      label="Mark Complete"
                      onPress={handleMarkSlotComplete}
                      loading={slotUpdating}
                      size="sm"
                      haptic
                      style={styles.actionBtn}
                    />
                    <GlassButton
                      label="Photo"
                      icon={<Icon name="camera-outline" size={16} color={Colors.text.primary} />}
                      onPress={handleUploadSlotPhoto}
                      variant="secondary"
                      size="sm"
                      style={styles.actionBtn}
                    />
                  </View>
                </>
              )}

              <Text style={styles.waitingText}>
                You're paid in full when the homeowner approves your completed work. Upload at least one completion photo before marking the trade complete.
              </Text>
            </TradePanel>
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
  enRouteBtn: { marginTop: 12 },
  enRouteSent: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
  },
  enRouteSentText: { color: Colors.success, fontSize: 13, fontWeight: '600' },
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
