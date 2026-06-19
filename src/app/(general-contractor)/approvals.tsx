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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { formatStatusLabel } from '@/lib/formatters';
import { formatCadCents, formatSignedCadCents } from '@/lib/currency';
import { formatGcProjectType } from '@/lib/gc-project-type';
import { isGeneralContractorReadyForProjectControls } from '@/lib/general-contractor';
import type { GcConciergeBooking, GcPaymentRequest } from '@/types/database.types';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground, GlassButton, GlassCard, GlassInput, StatusBadge } from '@/components/ui';
import { TradeEmptyState, TradeScreenHeader } from '@/components/company/TradeUI';

type ProjectJoin = {
  room_type: string | null;
  city: string | null;
  address: string | null;
} | Array<{
  room_type: string | null;
  city: string | null;
  address: string | null;
}> | null;

interface ApprovalRow {
  id: string;
  description: string;
  cost_delta: number | null;
  status: string;
  signed_by_homeowner: boolean;
  signed_by_company: boolean;
  project_id: string;
  project_type?: string | null;
  project?: ProjectJoin;
}

interface RecommendationApprovalRow {
  id: string;
  project_id: string;
  request_type: string;
  title: string;
  cost_delta: number | null;
  timeline_delta_days: number | null;
  status: string;
  response_note: string | null;
  project_type?: string | null;
  project?: ProjectJoin;
}

type PaymentRequestRow = GcPaymentRequest & {
  project_type?: string | null;
  project?: ProjectJoin;
};

type GcProjectAssignmentRow = {
  project_id: string;
  project_type: string | null;
};

type GcConciergeProfile = {
  verified?: boolean | null;
  concierge_enabled?: boolean | null;
  business_name?: string | null;
  city?: string | null;
  province?: string | null;
  lat?: number | null;
  lng?: number | null;
  license_number?: string | null;
  license_doc_url?: string | null;
  insurance_doc_url?: string | null;
};

function getProject(row: { project?: ProjectJoin }) {
  return Array.isArray(row.project) ? row.project[0] ?? null : row.project ?? null;
}

function hasCompleteGcConciergeProfile(gc: GcConciergeProfile | null | undefined) {
  return gc?.concierge_enabled === true
    && isGeneralContractorReadyForProjectControls(gc);
}

export default function GeneralContractorApprovals() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [recommendationRequests, setRecommendationRequests] = useState<RecommendationApprovalRow[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestRow[]>([]);
  const [bookingRequests, setBookingRequests] = useState<GcConciergeBooking[]>([]);
  const [canAcceptConciergeBookings, setCanAcceptConciergeBookings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingBookingId, setRespondingBookingId] = useState<string | null>(null);
  const [bookingResponseNotes, setBookingResponseNotes] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [setupLockMessage, setSetupLockMessage] = useState<string | null>(null);

  const clearApprovalsState = useCallback(() => {
    setApprovals([]);
    setRecommendationRequests([]);
    setPaymentRequests([]);
    setBookingRequests([]);
    setCanAcceptConciergeBookings(false);
    setRespondingBookingId(null);
    setBookingResponseNotes({});
  }, []);

  const fetchData = useCallback(async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to view approvals.');
      setSetupLockMessage(null);
      clearApprovalsState();
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      setSetupLockMessage(null);
      const { data: gc, error: profileError } = await supabase
        .from('general_contractors')
        .select('id, verified, concierge_enabled, business_name, city, province, lat, lng, license_number, license_doc_url, insurance_doc_url')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!gc?.id) {
        clearApprovalsState();
        setSetupLockMessage('Create your GC business profile before approvals, payment requests, and concierge bookings can be reviewed.');
        return;
      }
      const gcReadyForProjectControls = isGeneralContractorReadyForProjectControls(gc);
      setCanAcceptConciergeBookings(hasCompleteGcConciergeProfile(gc));

      if (!gcReadyForProjectControls) {
        clearApprovalsState();
        setSetupLockMessage('Complete verified GC setup is required before approvals, payment requests, and concierge bookings can be reviewed.');
        return;
      }

      const { data: assignments, error: assignmentError } = await supabase
        .from('general_contractor_projects')
        .select('project_id, project_type')
        .eq('general_contractor_id', gc.id)
        .in('status', ['active', 'completed']);
      if (assignmentError) throw assignmentError;

      const projectIds = (assignments ?? []).map((row) => row.project_id).filter(Boolean);
      const projectTypeById = new Map(
        ((assignments ?? []) as GcProjectAssignmentRow[]).map((assignment) => [assignment.project_id, assignment.project_type]),
      );

      const bookingResult = await supabase
        .from('gc_concierge_bookings')
        .select('id, project_id, general_contractor_id, homeowner_id, service_kind, title, duration_minutes, price_cents, status, payment_status, stripe_payment_intent_id, stripe_transfer_id, paid_at, payout_released_at, response_note, created_at, responded_at')
        .eq('general_contractor_id', gc.id)
        .order('created_at', { ascending: false });
      if (bookingResult.error) throw bookingResult.error;
      setBookingRequests((bookingResult.data ?? []) as GcConciergeBooking[]);

      if (projectIds.length === 0) {
        setApprovals([]);
        setRecommendationRequests([]);
        setPaymentRequests([]);
        return;
      }

      const [recommendationResult, paymentResult, changeOrderResult] = await Promise.all([
        supabase
          .from('project_approval_requests')
          .select(`
            id, project_id, request_type, title, cost_delta, timeline_delta_days, status, response_note,
            project:projects ( room_type, city, address )
          `)
          .eq('requested_by_gc_id', gc.id)
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('gc_payment_requests')
          .select(`
            id, project_id, general_contractor_id, homeowner_id, request_kind, title, description,
            amount_cents, status, response_note, created_at, responded_at, cancelled_at,
            project:projects ( room_type, city, address )
          `)
          .eq('general_contractor_id', gc.id)
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('change_orders')
          .select(`
            id, description, cost_delta, status, signed_by_homeowner, signed_by_company, project_id,
            project:projects ( room_type, city, address )
          `)
          .in('project_id', projectIds)
          .order('created_at', { ascending: false }),
      ]);
      if (recommendationResult.error) throw recommendationResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (changeOrderResult.error) throw changeOrderResult.error;
      setRecommendationRequests(((recommendationResult.data ?? []) as RecommendationApprovalRow[]).map((request) => ({
        ...request,
        project_type: projectTypeById.get(request.project_id) ?? null,
      })));
      setPaymentRequests(((paymentResult.data ?? []) as PaymentRequestRow[]).map((request) => ({
        ...request,
        project_type: projectTypeById.get(request.project_id) ?? null,
      })));

      setApprovals(((changeOrderResult.data ?? []) as ApprovalRow[]).map((approval) => ({
        ...approval,
        project_type: projectTypeById.get(approval.project_id) ?? null,
      })));
    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load approvals.'));
      clearApprovalsState();
      setSetupLockMessage(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clearApprovalsState, user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleBookingResponse = async (booking: GcConciergeBooking, status: 'accepted' | 'rejected') => {
    if (status === 'accepted' && !canAcceptConciergeBookings) {
      Alert.alert('Concierge unavailable', 'WalkerAI verification, concierge marketplace access, and complete business, license, and insurance setup are required before you can accept concierge requests.');
      return;
    }

    const responseNote = bookingResponseNotes[booking.id]?.trim() ?? '';

    Alert.alert(
      status === 'accepted' ? 'Accept concierge request?' : 'Reject concierge request?',
      status === 'accepted'
        ? 'This confirms the consultation request. The homeowner can pay it securely in WalkerAI after acceptance.'
        : 'This marks the consultation request as rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'accepted' ? 'Accept' : 'Reject',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setRespondingBookingId(booking.id);
            try {
              const { error } = await supabase.rpc('respond_to_gc_concierge_booking', {
                p_booking_id: booking.id,
                p_status: status,
                p_response_note: responseNote || null,
              });
              if (error) {
                Alert.alert('Could not respond', formatAppSafeErrorMessage(error, 'Please try again.'));
                return;
              }
              setBookingResponseNotes((current) => {
                const next = { ...current };
                delete next[booking.id];
                return next;
              });
              await fetchData();
            } catch (err) {
              Alert.alert('Could not respond', formatAppSafeErrorMessage(err, 'Please try again.'));
            } finally {
              setRespondingBookingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <TradeScreenHeader title="Approvals" subtitle="Homeowner decisions that gate managed project changes" />

          {errorMessage ? (
            <TradeEmptyState icon="wifi-off" title="Could not load approvals" body={errorMessage} />
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading approvals...</Text>
            </GlassCard>
          ) : setupLockMessage ? (
            <TradeEmptyState
              icon="lock-alert-outline"
              title="GC setup required"
              body={setupLockMessage}
            />
          ) : approvals.length === 0 && recommendationRequests.length === 0 && paymentRequests.length === 0 && bookingRequests.length === 0 ? (
            <TradeEmptyState
              icon="clipboard-check-outline"
              title="No approval requests"
              body="Change orders and other homeowner decisions for GC-managed projects will appear here."
            />
          ) : (
            <>
              {bookingRequests.length > 0 ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Concierge requests</Text>
                  {bookingRequests.map((booking) => {
                    const pending = booking.status === 'pending';
                    const responding = respondingBookingId === booking.id;
                    return (
                      <View key={booking.id} style={styles.bookingItem}>
                        <View style={styles.cardHeader}>
                          <View style={styles.iconWrap}>
                            <Icon
                              name={booking.status === 'accepted' ? 'calendar-check-outline' : booking.status === 'rejected' ? 'calendar-remove-outline' : 'calendar-clock-outline'}
                              size={20}
                              color={booking.status === 'accepted' ? Colors.success : booking.status === 'rejected' ? Colors.error : Colors.warning}
                            />
                          </View>
                          <View style={styles.cardBody}>
                            <Text style={styles.projectTitle}>{booking.title}</Text>
                            <Text style={styles.projectMeta}>{formatCadCents(booking.price_cents)}</Text>
                            <Text style={styles.projectMeta}>Payment: {formatStatusLabel(booking.payment_status ?? 'unpaid')}</Text>
                            {booking.stripe_transfer_id ? (
                              <Text style={styles.projectMeta}>
                                Payout released{booking.payout_released_at ? ` · ${new Date(booking.payout_released_at).toLocaleDateString('en-CA')}` : ''}
                              </Text>
                            ) : booking.payment_status === 'paid' ? (
                              <Text style={styles.projectMeta}>Waiting for homeowner completion confirmation</Text>
                            ) : null}
                          </View>
                          <StatusBadge label={formatStatusLabel(booking.status)} variant={pending ? 'pending' : ['accepted', 'completed'].includes(booking.status) ? 'completed' : 'error'} dot />
                        </View>
                        {pending ? (
                          <>
                            {!canAcceptConciergeBookings ? (
                              <Text style={styles.lockedText}>
                                WalkerAI verification, concierge marketplace access, and complete business, license, and insurance setup are required before this request can be accepted.
                              </Text>
                            ) : null}
                            <GlassInput
                              label="Optional response note"
                              value={bookingResponseNotes[booking.id] ?? ''}
                              onChangeText={(text) => setBookingResponseNotes((current) => ({ ...current, [booking.id]: text }))}
                              containerStyle={styles.bookingNoteInput}
                            />
                            <View style={styles.bookingActions}>
                              <GlassButton
                                label="Accept"
                                onPress={() => handleBookingResponse(booking, 'accepted')}
                                loading={responding}
                                disabled={!canAcceptConciergeBookings || !!respondingBookingId}
                                size="sm"
                                style={styles.bookingButton}
                              />
                              <GlassButton
                                label="Reject"
                                onPress={() => handleBookingResponse(booking, 'rejected')}
                                loading={responding}
                                disabled={!!respondingBookingId}
                                variant="destructive"
                                size="sm"
                                style={styles.bookingButton}
                              />
                            </View>
                          </>
                        ) : booking.response_note ? (
                          <Text style={styles.responseNote}>Your note: {booking.response_note}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </GlassCard>
              ) : null}

              {recommendationRequests.length > 0 ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Homeowner approval requests</Text>
                  {recommendationRequests.map((request) => {
                    const project = getProject(request);
                    const pending = request.status === 'pending';
                    return (
                      <TouchableOpacity
                        key={request.id}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('GeneralContractorProjectDetail', { id: request.project_id })}
                      >
                        <View style={styles.bookingItem}>
                          <View style={styles.cardHeader}>
                            <View style={styles.iconWrap}>
                              <Icon
                                name={pending ? 'clock-alert-outline' : request.status === 'approved' ? 'check-circle-outline' : 'close-circle-outline'}
                                size={20}
                                color={pending ? Colors.warning : request.status === 'approved' ? Colors.success : Colors.error}
                              />
                            </View>
                            <View style={styles.cardBody}>
                              <Text style={styles.projectTitle}>{request.title}</Text>
                              <Text style={styles.projectMeta}>
                                {formatGcProjectType(request.project_type, project?.room_type)} · {project?.city || project?.address || 'Managed project'}
                              </Text>
                            </View>
                            <StatusBadge label={formatStatusLabel(request.status)} variant={pending ? 'pending' : request.status === 'approved' ? 'completed' : 'error'} dot />
                          </View>
                          <Text style={styles.costText}>
                            {formatStatusLabel(request.request_type)}
                            {request.cost_delta != null ? ` · ${formatSignedCadCents(request.cost_delta)}` : ''}
                            {request.timeline_delta_days != null ? ` · ${request.timeline_delta_days > 0 ? '+' : ''}${request.timeline_delta_days} days` : ''}
                          </Text>
                          {request.response_note ? (
                            <Text style={styles.responseNote}>Homeowner note: {request.response_note}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </GlassCard>
              ) : null}

              {paymentRequests.length > 0 ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Payment requests</Text>
                  {paymentRequests.map((request) => {
                    const project = getProject(request);
                    const pending = request.status === 'pending';
                    return (
                      <TouchableOpacity
                        key={request.id}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('GeneralContractorPayments', { id: request.project_id })}
                      >
                        <View style={styles.bookingItem}>
                          <View style={styles.cardHeader}>
                            <View style={styles.iconWrap}>
                              <Icon
                                name={pending ? 'cash' : request.status === 'approved' ? 'cash-check' : 'cash-remove'}
                                size={20}
                                color={pending ? Colors.warning : request.status === 'approved' ? Colors.success : Colors.error}
                              />
                            </View>
                            <View style={styles.cardBody}>
                              <Text style={styles.projectTitle}>{request.title}</Text>
                              <Text style={styles.projectMeta}>
                                {formatGcProjectType(request.project_type, project?.room_type)} · {project?.city || project?.address || 'Managed project'}
                              </Text>
                              <Text style={styles.projectMeta}>
                                {formatStatusLabel(request.request_kind)} · {formatCadCents(request.amount_cents)}
                              </Text>
                            </View>
                            <StatusBadge label={formatStatusLabel(request.status)} variant={pending ? 'pending' : request.status === 'approved' ? 'completed' : 'error'} dot />
                          </View>
                          {request.description ? <Text style={styles.costText}>{request.description}</Text> : null}
                          {pending ? (
                            <Text style={styles.waitingText}>
                              Waiting for homeowner authorization. Escrow release still happens through milestones.
                            </Text>
                          ) : request.response_note ? (
                            <Text style={styles.responseNote}>Homeowner note: {request.response_note}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </GlassCard>
              ) : null}

              {approvals.map((approval) => {
                const project = getProject(approval);
                const needsHomeowner = approval.status === 'proposed' && approval.signed_by_company && !approval.signed_by_homeowner;
                return (
                  <TouchableOpacity
                    key={approval.id}
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('GeneralContractorProjectDetail', { id: approval.project_id })}
                  >
                    <GlassCard style={[styles.card, needsHomeowner && styles.needsAction]}>
                      <View style={styles.cardHeader}>
                        <View style={styles.iconWrap}>
                          <Icon name={needsHomeowner ? 'clock-alert-outline' : 'clipboard-text-outline'} size={20} color={needsHomeowner ? Colors.warning : Colors.text.secondary} />
                        </View>
                        <View style={styles.cardBody}>
                          <Text style={styles.projectTitle}>{formatGcProjectType(approval.project_type, project?.room_type)}</Text>
                          <Text style={styles.projectMeta}>{project?.city || project?.address || 'Managed project'}</Text>
                        </View>
                        <StatusBadge label={formatStatusLabel(approval.status)} variant={needsHomeowner ? 'pending' : approval.status === 'approved' ? 'completed' : 'neutral'} dot />
                      </View>
                      <Text style={styles.description}>{approval.description}</Text>
                      {approval.cost_delta != null ? (
                        <Text style={styles.costText}>Documented cost change: {formatSignedCadCents(approval.cost_delta)}</Text>
                      ) : null}
                      {needsHomeowner ? (
                        <Text style={styles.waitingText}>Waiting for homeowner approval</Text>
                      ) : null}
                    </GlassCard>
                  </TouchableOpacity>
                );
              })}
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
  card: { marginBottom: Spacing.sm },
  needsAction: { borderColor: 'rgba(245,158,11,0.45)' },
  sectionTitle: { ...Typography.label, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  projectTitle: { ...Typography.h3 },
  projectMeta: { ...Typography.caption, marginTop: 2 },
  description: { ...Typography.body, marginBottom: 8 },
  costText: { ...Typography.caption, color: Colors.text.secondary },
  responseNote: { ...Typography.caption, color: Colors.text.primary, marginTop: 6, lineHeight: 18 },
  waitingText: { ...Typography.caption, color: Colors.warning, marginTop: 8, fontWeight: '700' },
  lockedText: { ...Typography.caption, color: Colors.warning, marginTop: 2, marginBottom: 8, lineHeight: 18 },
  bodyText: { ...Typography.bodySecondary },
  bookingItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  bookingNoteInput: { marginTop: 4, marginBottom: 8 },
  bookingActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  bookingButton: { flex: 1 },
});
