import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { formatCadCents, parsePositiveCadToCents } from '@/lib/currency';
import { formatStatusLabel } from '@/lib/formatters';
import { GENERAL_CONTRACTOR_READINESS_SELECT, isGeneralContractorReadyForProjectControls } from '@/lib/general-contractor';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';
import type { GcPaymentRequest } from '@/types/database.types';

type PaymentKind = 'deposit' | 'progress_draw' | 'final_payment';

interface Assignment {
  id: string;
  status: string;
  homeowner_id: string;
  general_contractor_id: string;
}

const PAYMENT_KIND_OPTIONS: Array<{ value: PaymentKind; label: string; icon: string }> = [
  { value: 'deposit', label: 'Deposit', icon: 'cash-plus' },
  { value: 'progress_draw', label: 'Progress', icon: 'progress-check' },
  { value: 'final_payment', label: 'Final', icon: 'flag-checkered' },
];

function statusVariant(status: string): 'pending' | 'completed' | 'error' | 'neutral' {
  if (status === 'approved') return 'completed';
  if (status === 'rejected' || status === 'cancelled') return 'error';
  if (status === 'pending') return 'pending';
  return 'neutral';
}

function statusIcon(status: string) {
  if (status === 'approved') return 'check-circle-outline';
  if (status === 'rejected' || status === 'cancelled') return 'close-circle-outline';
  return 'clock-outline';
}

function statusColor(status: string) {
  if (status === 'approved') return Colors.success;
  if (status === 'rejected' || status === 'cancelled') return Colors.error;
  return Colors.warning;
}

function defaultTitle(kind: PaymentKind) {
  if (kind === 'deposit') return 'Deposit request';
  if (kind === 'final_payment') return 'Final payment request';
  return 'Progress draw request';
}

export default function GeneralContractorPaymentsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [requests, setRequests] = useState<GcPaymentRequest[]>([]);
  const [requestKind, setRequestKind] = useState<PaymentKind>('progress_draw');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [gcReady, setGcReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearPaymentRequestState = useCallback(() => {
    setAssignment(null);
    setRequests([]);
    setAmount('');
    setTitle('');
    setDescription('');
    setCancellingRequestId(null);
    setGcReady(false);
  }, []);

  const fetchData = useCallback(async () => {
    if (!projectId) {
      setErrorMessage('Project is missing. Reopen payment requests from the GC project page.');
      clearPaymentRequestState();
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id) {
      setErrorMessage('You need to be signed in to manage payment requests.');
      clearPaymentRequestState();
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const { data: gc, error: gcError } = await supabase
        .from('general_contractors')
        .select(GENERAL_CONTRACTOR_READINESS_SELECT)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');
      setGcReady(isGeneralContractorReadyForProjectControls(gc));

      const [assignmentResult, requestResult] = await Promise.all([
        supabase
          .from('general_contractor_projects')
          .select('id, status, homeowner_id, general_contractor_id')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .maybeSingle(),
        supabase
          .from('gc_payment_requests')
          .select('id, project_id, general_contractor_id, homeowner_id, request_kind, title, description, amount_cents, status, response_note, created_at, responded_at, cancelled_at')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .order('created_at', { ascending: false }),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      if (requestResult.error) throw requestResult.error;

      setAssignment(assignmentResult.data as Assignment | null);
      setRequests((requestResult.data ?? []) as GcPaymentRequest[]);
    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load payment requests.'));
      clearPaymentRequestState();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clearPaymentRequestState, projectId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleSubmit = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before payment requests can be sent.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before payment requests can be sent.');
      return;
    }

    const amountCents = parsePositiveCadToCents(amount);
    if (amountCents == null) {
      Alert.alert('Amount required', 'Enter a valid payment amount in CAD.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('gc_payment_requests').insert({
        project_id: projectId,
        general_contractor_id: assignment.general_contractor_id,
        homeowner_id: assignment.homeowner_id,
        request_kind: requestKind,
        title: title.trim() || defaultTitle(requestKind),
        description: description.trim() || null,
        amount_cents: amountCents,
      });
      if (error) throw error;
      Alert.alert('Payment request sent', 'The homeowner must approve this request. Funds are still released through existing escrow milestones.');
      setAmount('');
      setTitle('');
      setDescription('');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not send payment request', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (request: GcPaymentRequest) => {
    if (request.status !== 'pending') {
      Alert.alert('Request already finalized', 'Only pending payment requests can be cancelled.');
      return;
    }
    if (!assignment || assignment.general_contractor_id !== request.general_contractor_id) {
      Alert.alert('Request unavailable', 'Refresh payment requests and try again.');
      return;
    }
    if (assignment.status !== 'active' || !gcReady) {
      Alert.alert('Active complete GC management required', 'Only an active verified GC with complete setup can cancel a pending payment request.');
      return;
    }

    Alert.alert(
      'Cancel payment request?',
      'This removes the pending homeowner authorization request. No escrow or milestone funds are moved.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setCancellingRequestId(request.id);
            try {
              const { error } = await supabase
                .from('gc_payment_requests')
                .update({
                  status: 'cancelled',
                  cancelled_at: new Date().toISOString(),
                })
                .eq('id', request.id)
                .eq('project_id', projectId)
                .eq('general_contractor_id', assignment.general_contractor_id)
                .eq('status', 'pending');

              if (error) {
                Alert.alert('Could not cancel request', formatAppSafeErrorMessage(error, 'Please try again.'));
                return;
              }
              await fetchData();
            } catch (err) {
              Alert.alert('Could not cancel request', formatAppSafeErrorMessage(err, 'Please try again.'));
            } finally {
              setCancellingRequestId(null);
            }
          },
        },
      ],
    );
  };

  const canManagePaymentRequests = assignment?.status === 'active' && gcReady;

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-left" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.headerBody}>
              <Text style={styles.title}>Payment Requests</Text>
              <Text style={styles.subtitle}>Request deposits, progress draws, or final payment for homeowner approval.</Text>
            </View>
          </View>

          <GlassCard style={styles.card}>
            <View style={styles.noticeHeader}>
              <Icon name="shield-lock-outline" size={20} color={Colors.warning} />
              <Text style={styles.sectionTitleNoMargin}>Escrow stays protected</Text>
            </View>
            <Text style={styles.bodyText}>
              Funds are still released through existing escrow milestones. This request records homeowner authorization and does not move money by itself.
            </Text>
          </GlassCard>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Payment requests unavailable</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading payment requests...</Text>
            </GlassCard>
          ) : (
            <>
              {canManagePaymentRequests ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>New request</Text>
                  <View style={styles.kindGrid}>
                    {PAYMENT_KIND_OPTIONS.map((kind) => {
                      const selected = requestKind === kind.value;
                      return (
                        <TouchableOpacity
                          key={kind.value}
                          style={[styles.kindChip, selected && styles.kindChipActive]}
                          onPress={() => setRequestKind(kind.value)}
                          activeOpacity={0.85}
                        >
                          <Icon name={kind.icon} size={18} color={selected ? Colors.accent : Colors.text.secondary} />
                          <Text style={[styles.kindText, selected && styles.kindTextActive]}>{kind.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <GlassInput
                    label="Amount CAD"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Title"
                    value={title}
                    onChangeText={setTitle}
                    placeholder={defaultTitle(requestKind)}
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Reason"
                    value={description}
                    onChangeText={setDescription}
                    containerStyle={styles.formInput}
                  />
                  <GlassButton
                    label="Send Payment Request"
                    onPress={handleSubmit}
                    loading={submitting}
                    fullWidth
                    style={styles.submitButton}
                  />
                </GlassCard>
              ) : assignment?.status === 'active' ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Complete setup required</Text>
                  <Text style={styles.bodyText}>
                    Complete verified GC setup is required before payment requests can be sent.
                  </Text>
                </GlassCard>
              ) : assignment?.status === 'completed' ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Payment history</Text>
                  <Text style={styles.bodyText}>
                    Project completed. Deposit, progress, and final draw requests are available read-only; escrow releases remain in the milestone record.
                  </Text>
                </GlassCard>
              ) : (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Homeowner confirmation required</Text>
                  <Text style={styles.bodyText}>
                    Payment requests unlock after the homeowner confirms active GC management.
                  </Text>
                </GlassCard>
              )}

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Request history</Text>
                {requests.length === 0 ? (
                  <Text style={styles.bodyText}>No payment requests have been sent yet.</Text>
                ) : requests.map((request) => {
                  const pending = request.status === 'pending';
                  return (
                    <View key={request.id} style={styles.requestRow}>
                      <View style={styles.requestIcon}>
                        <Icon
                          name={statusIcon(request.status)}
                          size={18}
                          color={statusColor(request.status)}
                        />
                      </View>
                      <View style={styles.requestBody}>
                        <View style={styles.requestHeader}>
                          <Text style={styles.requestTitle}>{request.title}</Text>
                          <StatusBadge label={formatStatusLabel(request.status)} variant={statusVariant(request.status)} size="sm" />
                        </View>
                        <Text style={styles.requestMeta}>
                          {formatStatusLabel(request.request_kind)} · {formatCadCents(request.amount_cents)}
                        </Text>
                        {request.description ? <Text style={styles.requestDescription}>{request.description}</Text> : null}
                        {request.response_note ? <Text style={styles.responseNote}>Homeowner note: {request.response_note}</Text> : null}
                        {pending && canManagePaymentRequests ? (
                          <GlassButton
                            label="Cancel Request"
                            onPress={() => handleCancelRequest(request)}
                            loading={cancellingRequestId === request.id}
                            disabled={!canManagePaymentRequests || !!cancellingRequestId}
                            variant="secondary"
                            size="sm"
                            style={styles.cancelButton}
                          />
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </GlassCard>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: Spacing.md },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  headerBody: { flex: 1 },
  title: { ...Typography.h2, marginBottom: 3 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 21 },
  card: { marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  sectionTitleNoMargin: { ...Typography.label },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  noticeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  kindGrid: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
  kindChip: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: 14,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  kindChipActive: {
    borderColor: 'rgba(255,107,0,0.65)',
    backgroundColor: 'rgba(255,107,0,0.14)',
  },
  kindText: { color: Colors.text.secondary, fontSize: 12, fontWeight: '800' },
  kindTextActive: { color: Colors.text.primary },
  formInput: { marginBottom: Spacing.sm },
  submitButton: { marginTop: 2 },
  requestRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  requestIcon: { width: 24, alignItems: 'center', paddingTop: 2 },
  requestBody: { flex: 1 },
  requestHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  requestTitle: { ...Typography.body, fontWeight: '800', flex: 1 },
  requestMeta: { ...Typography.caption, marginTop: 3 },
  requestDescription: { ...Typography.bodySecondary, lineHeight: 21, marginTop: 8 },
  responseNote: { ...Typography.caption, color: Colors.text.secondary, marginTop: 8, lineHeight: 18 },
  cancelButton: { marginTop: 10, alignSelf: 'flex-start' },
});
