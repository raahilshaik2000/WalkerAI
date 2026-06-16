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
import { useStripe } from '@stripe/stripe-react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { getPaymentSheetConfig } from '@/lib/payments';
import { formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import type { GcConciergeBooking, GcPaymentRequest, GeneralContractor } from '@/types/database.types';
import { formatStatusLabel } from '@/lib/formatters';
import { formatCadCents, formatSignedCadCents } from '@/lib/currency';
import { formatGcProjectType } from '@/lib/gc-project-type';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

type AssignedGeneralContractor = Pick<GeneralContractor, 'id' | 'business_name' | 'city' | 'province' | 'rating' | 'total_reviews' | 'concierge_enabled' | 'verified'>;

interface CurrentAssignment {
  id: string;
  status: string;
  markup_pct: number;
  concierge_fee_pct: number;
  project_type: string | null;
  scope_summary: string | null;
  initiated_by_gc: boolean;
  general_contractor?: AssignedGeneralContractor | AssignedGeneralContractor[] | null;
}

interface ApprovalRequest {
  id: string;
  request_type: string;
  title: string;
  description: string | null;
  cost_delta: number | null;
  timeline_delta_days: number | null;
  status: string;
  response_note: string | null;
  metadata: Record<string, unknown> | null;
}

type ConciergeServiceKind = GcConciergeBooking['service_kind'];
type DiscoverableGeneralContractor = GeneralContractor & { distance_km?: number | null };

const CONCIERGE_SERVICE_OPTIONS: Array<{ kind: ConciergeServiceKind; label: string; price: string }> = [
  { kind: 'virtual_30', label: '30 min virtual', price: '$99' },
  { kind: 'virtual_60', label: '60 min virtual', price: '$149' },
  { kind: 'site_visit_first_hour', label: 'Site visit', price: '$249' },
  { kind: 'full_project_concierge', label: 'Full project', price: '10%' },
];

function getAssignedGc(row: CurrentAssignment | null) {
  if (!row) return null;
  return Array.isArray(row.general_contractor)
    ? row.general_contractor[0] ?? null
    : row.general_contractor ?? null;
}

function isMissingGcDiscoveryRpcError(error: { message?: string; details?: string } | null | undefined) {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return text.includes('general_contractors_for_project')
    || text.includes('function')
    || text.includes('schema cache');
}

async function fetchDiscoverableGeneralContractors(projectId: string): Promise<DiscoverableGeneralContractor[]> {
  const { data, error } = await supabase.rpc('general_contractors_for_project', {
    p_project_id: projectId,
  });

  if (!error) return (data ?? []) as DiscoverableGeneralContractor[];
  if (!isMissingGcDiscoveryRpcError(error)) throw error;

  // Older databases may not have the radius-matching RPC yet. Keep the screen
  // usable, while new deployments use the server-side service-area filter.
  const fallback = await supabase
    .from('general_contractors')
    .select('*')
    .eq('verified', true)
    .order('rating', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as DiscoverableGeneralContractor[];
}

function formatGcDistance(gc: DiscoverableGeneralContractor): string | null {
  if (typeof gc.distance_km !== 'number' || !Number.isFinite(gc.distance_km)) return null;
  if (gc.distance_km < 1) return '<1 km away';
  return `${Math.round(gc.distance_km)} km away`;
}

function gcAssignmentStatusVariant(status: string): 'active' | 'completed' | 'pending' | 'neutral' {
  if (status === 'active') return 'active';
  if (status === 'completed') return 'completed';
  if (status === 'invited') return 'pending';
  return 'neutral';
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = metadata?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getApprovalAction(request: ApprovalRequest): string | null {
  const action = request.metadata?.action;
  return typeof action === 'string' ? action : null;
}

function getApprovalDetailRows(request: ApprovalRequest): string[] {
  const action = getApprovalAction(request);
  if (action === 'update_gc_budget') {
    const min = getMetadataNumber(request.metadata, 'proposed_ai_cost_min');
    const max = getMetadataNumber(request.metadata, 'proposed_ai_cost_max');
    return min != null && max != null
      ? [`New project estimate: ${formatCadCents(min)} - ${formatCadCents(max)}`]
      : ['Approving updates the project estimate after validation.'];
  }
  if (action === 'update_gc_terms') {
    const markup = getMetadataNumber(request.metadata, 'proposed_markup_pct');
    const conciergeFee = getMetadataNumber(request.metadata, 'proposed_concierge_fee_pct');
    return [
      markup != null ? `New markup: ${markup.toFixed(2)}%` : null,
      conciergeFee != null ? `New concierge fee: ${conciergeFee.toFixed(2)}%` : null,
    ].filter((row): row is string => Boolean(row));
  }
  if (action === 'complete_project') {
    return ['Approving marks the managed project complete.'];
  }
  return [];
}

function getApprovalConfirmMessage(request: ApprovalRequest, status: 'approved' | 'rejected'): string {
  if (status === 'rejected') return 'This records that the recommendation was rejected.';

  const action = getApprovalAction(request);
  if (action === 'update_gc_budget') {
    const min = getMetadataNumber(request.metadata, 'proposed_ai_cost_min');
    const max = getMetadataNumber(request.metadata, 'proposed_ai_cost_max');
    return min != null && max != null
      ? `Approving updates the project estimate to ${formatCadCents(min)} - ${formatCadCents(max)}.`
      : 'Approving updates the project estimate after WalkerAI validates the request.';
  }
  if (action === 'update_gc_terms') {
    return 'Approving updates the GC markup and concierge fee for this managed project.';
  }
  if (action === 'complete_project') {
    return 'Approving marks this managed project complete.';
  }
  if (request.request_type === 'material_substitution') {
    return 'Approving updates the project material preference fields.';
  }
  if (request.request_type === 'schedule_change') {
    return 'Approving applies the proposed schedule change.';
  }
  if (request.request_type === 'trade_substitution') {
    return 'Approving records the GC trade recommendation for this scope.';
  }
  return 'This records your approval for the GC recommendation.';
}

export default function ProjectConciergeScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { user } = useAuthStore();
  const [projectHomeownerId, setProjectHomeownerId] = useState<string | null>(null);
  const [currentAssignment, setCurrentAssignment] = useState<CurrentAssignment | null>(null);
  const [generalContractors, setGeneralContractors] = useState<DiscoverableGeneralContractor[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<GcPaymentRequest[]>([]);
  const [bookingRequests, setBookingRequests] = useState<GcConciergeBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);
  const [releasingBookingId, setReleasingBookingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectId) {
      setErrorMessage('Project is missing. Reopen concierge from your project details.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to manage concierge support.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const [projectResult, assignmentResult, gcList, approvalResult, paymentResult, bookingResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, homeowner_id')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('general_contractor_projects')
          .select(`
            id, status, markup_pct, concierge_fee_pct, project_type, scope_summary, initiated_by_gc,
            general_contractor:general_contractors ( id, business_name, city, province, rating, total_reviews, concierge_enabled, verified )
          `)
          .eq('project_id', projectId)
          .neq('status', 'removed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        fetchDiscoverableGeneralContractors(projectId),
        supabase
          .from('project_approval_requests')
          .select('id, request_type, title, description, cost_delta, timeline_delta_days, status, response_note, metadata')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('gc_payment_requests')
          .select('id, project_id, general_contractor_id, homeowner_id, request_kind, title, description, amount_cents, status, response_note, created_at, responded_at, cancelled_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('gc_concierge_bookings')
          .select('id, project_id, general_contractor_id, homeowner_id, service_kind, title, duration_minutes, price_cents, contractor_payout_cents, walker_fee_cents, status, payment_status, stripe_payment_intent_id, stripe_transfer_id, paid_at, payout_released_at, response_note, created_at, responded_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (assignmentResult.error) throw assignmentResult.error;
      if (approvalResult.error) throw approvalResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (bookingResult.error) throw bookingResult.error;

      setProjectHomeownerId(projectResult.data?.homeowner_id ?? null);
      setCurrentAssignment(assignmentResult.data as CurrentAssignment | null);
      setGeneralContractors(gcList);
      setApprovalRequests((approvalResult.data ?? []) as ApprovalRequest[]);
      setPaymentRequests((paymentResult.data ?? []) as GcPaymentRequest[]);
      setBookingRequests((bookingResult.data ?? []) as GcConciergeBooking[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load concierge options.');
      setCurrentAssignment(null);
      setGeneralContractors([]);
      setApprovalRequests([]);
      setPaymentRequests([]);
      setBookingRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId, user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const assignedGc = getAssignedGc(currentAssignment);
  const assignedGcCanRequestConcierge = assignedGc?.verified === true && assignedGc.concierge_enabled === true;
  const canApproveGcPaymentRequests = currentAssignment?.status === 'active' && assignedGc?.verified === true;

  const handleApprovalResponse = async (request: ApprovalRequest, status: 'approved' | 'rejected') => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id) {
      Alert.alert('Not allowed', 'Only the homeowner can respond to approval requests.');
      return;
    }

    Alert.alert(
      status === 'approved' ? 'Approve request?' : 'Reject request?',
      getApprovalConfirmMessage(request, status),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'approved' ? 'Approve' : 'Reject',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setRespondingId(request.id);
            const { error } = await supabase.rpc('respond_to_project_approval_request', {
              p_request_id: request.id,
              p_status: status,
              p_response_note: null,
            });
            if (error) {
              Alert.alert('Could not respond', error.message);
            } else {
              await fetchData();
            }
            setRespondingId(null);
          },
        },
      ],
    );
  };

  const handleReleaseBookingPayout = async (booking: GcConciergeBooking) => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id) {
      Alert.alert('Not allowed', 'Only the homeowner can release concierge payouts.');
      return;
    }
    if (booking.status === 'completed' && booking.stripe_transfer_id) {
      Alert.alert('Already released', 'This concierge payout has already been released.');
      return;
    }
    if (booking.status !== 'accepted') {
      Alert.alert('Booking not ready', 'The booking must be accepted before payout release.');
      return;
    }
    if (booking.payment_status !== 'paid') {
      Alert.alert('Payment required', 'Pay the concierge booking before releasing the GC payout.');
      return;
    }

    Alert.alert(
      'Release concierge payout?',
      `Confirm ${booking.title} is complete and release ${formatCadCents(booking.contractor_payout_cents)} to the GC.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release',
          onPress: async () => {
            setReleasingBookingId(booking.id);
            try {
              const { error } = await supabase.functions.invoke('gc-concierge-payout', {
                body: { booking_id: booking.id },
              });
              if (error) throw new Error(await formatSupabaseFunctionError(error));
              ReactNativeHapticFeedback.trigger('notificationSuccess');
              Alert.alert('Payout released', 'The GC concierge payout has been sent.');
              await fetchData();
            } catch (err) {
              Alert.alert('Release failed', await formatSupabaseFunctionError(err, 'Please try again.'));
            } finally {
              setReleasingBookingId(null);
            }
          },
        },
      ],
    );
  };

  const handlePaymentResponse = async (request: GcPaymentRequest, status: 'approved' | 'rejected') => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id) {
      Alert.alert('Not allowed', 'Only the homeowner can respond to payment requests.');
      return;
    }
    if (status === 'approved' && !canApproveGcPaymentRequests) {
      Alert.alert('Payment request locked', 'Active verified GC management is required before a payment request can be approved.');
      return;
    }

    Alert.alert(
      status === 'approved' ? 'Approve payment request?' : 'Reject payment request?',
      status === 'approved'
        ? 'Approving this records your authorization. It does not bypass milestone escrow release.'
        : 'This records that the GC payment request was rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'approved' ? 'Approve' : 'Reject',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setRespondingId(request.id);
            const { error } = await supabase.rpc('respond_to_gc_payment_request', {
              p_request_id: request.id,
              p_status: status,
              p_response_note: null,
            });
            if (error) {
              Alert.alert('Could not respond', error.message);
            } else {
              await fetchData();
            }
            setRespondingId(null);
          },
        },
      ],
    );
  };

  const handleInvite = async (gc: GeneralContractor) => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id) {
      Alert.alert('Not allowed', 'Only the homeowner can invite a GC to this project.');
      return;
    }
    if (currentAssignment) {
      Alert.alert('GC already selected', 'Remove or complete the current GC assignment before inviting another GC.');
      return;
    }

    Alert.alert(
      'Invite GC?',
      `${gc.business_name} will be invited to help manage this project. You still approve all major decisions before anything changes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Invite',
          onPress: async () => {
            setInvitingId(gc.id);
            const { error } = await supabase.from('general_contractor_projects').insert({
              project_id: projectId,
              general_contractor_id: gc.id,
              homeowner_id: currentUser.id,
              status: 'invited',
              markup_pct: gc.default_markup_pct,
              concierge_fee_pct: gc.default_concierge_fee_pct,
            });
            if (error) {
              Alert.alert('Could not invite GC', error.message);
            } else {
              await fetchData();
            }
            setInvitingId(null);
          },
        },
      ],
    );
  };

  const handleRequestBooking = async (
    gc: Pick<GeneralContractor, 'id' | 'business_name' | 'concierge_enabled' | 'verified'>,
    serviceKind: ConciergeServiceKind,
  ) => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id) {
      Alert.alert('Not allowed', 'Only the homeowner can request concierge services.');
      return;
    }
    if (!gc.concierge_enabled) {
      Alert.alert('Concierge unavailable', 'This GC has not enabled concierge services.');
      return;
    }
    if (gc.verified !== true) {
      Alert.alert('Concierge unavailable', 'WalkerAI verification is required before this GC can accept concierge service requests.');
      return;
    }

    const option = CONCIERGE_SERVICE_OPTIONS.find((item) => item.kind === serviceKind);
    Alert.alert(
      'Request concierge service?',
      `${option?.label ?? 'Concierge service'} will be sent to ${gc.business_name}. Once the GC accepts, you can pay securely in WalkerAI.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: async () => {
            const requestKey = `${gc.id}:${serviceKind}`;
            setBookingId(requestKey);
            const { error } = await supabase.rpc('request_gc_concierge_booking', {
              p_project_id: projectId,
              p_general_contractor_id: gc.id,
              p_service_kind: serviceKind,
            });
            if (error) {
              Alert.alert('Could not request service', error.message);
            } else {
              await fetchData();
            }
            setBookingId(null);
          },
        },
      ],
    );
  };

  const handlePayBooking = async (booking: GcConciergeBooking) => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id) {
      Alert.alert('Not allowed', 'Only the homeowner can pay concierge bookings.');
      return;
    }
    if (booking.status !== 'accepted') {
      Alert.alert('Booking not accepted', 'The GC must accept this concierge request before payment.');
      return;
    }
    if (booking.payment_status === 'paid') {
      Alert.alert('Already paid', 'This concierge booking has already been paid.');
      return;
    }

    Alert.alert(
      'Pay concierge booking?',
      `Pay ${formatCadCents(booking.price_cents)} for ${booking.title}? WalkerAI records the 80/20 payout split.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay Now',
          onPress: async () => {
            setPayingBookingId(booking.id);
            try {
              const { data, error } = await supabase.functions.invoke('create-gc-concierge-payment-intent', {
                body: { booking_id: booking.id },
              });
              if (error) throw new Error(await formatSupabaseFunctionError(error));
              const paymentSheetConfig = getPaymentSheetConfig(data);

              const { error: initErr } = await initPaymentSheet({
                paymentIntentClientSecret: paymentSheetConfig.clientSecret,
                merchantDisplayName: 'WalkerAI',
              });
              if (initErr) throw new Error(initErr.message);

              const { error: payErr } = await presentPaymentSheet();
              if (payErr) {
                if (payErr.code !== 'Canceled') throw new Error(payErr.message);
                return;
              }

              ReactNativeHapticFeedback.trigger('notificationSuccess');
              setTimeout(() => fetchData(), 1500);
              setTimeout(() => fetchData(), 4000);
              Alert.alert('Payment received', 'Your concierge booking payment is being confirmed.');
            } catch (err) {
              Alert.alert('Payment failed', await formatSupabaseFunctionError(err, 'Please try again.'));
            } finally {
              setPayingBookingId(null);
            }
          },
        },
      ],
    );
  };

  const handleConfirmGcManagement = async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id || !currentAssignment?.id) {
      Alert.alert('Not allowed', 'Only the homeowner can confirm GC management for this project.');
      return;
    }

    Alert.alert(
      'Confirm GC management?',
      'This lets the GC manage recommendations for the project. You still approve scope, spending, payments, trade changes, and schedule changes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setRespondingId(currentAssignment.id);
            const { error } = await supabase.rpc('confirm_gc_management_assignment', {
              p_assignment_id: currentAssignment.id,
            });
            if (error) {
              Alert.alert('Could not confirm GC', error.message);
            } else {
              await fetchData();
            }
            setRespondingId(null);
          },
        },
      ],
    );
  };

  const handleRemoveGcManagement = async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id || !currentAssignment?.id) {
      Alert.alert('Not allowed', 'Only the homeowner can remove GC management from this project.');
      return;
    }

    Alert.alert(
      'Remove GC management?',
      'This removes the GC from the project. Pending GC recommendations will no longer apply project changes, and you can invite another GC afterward.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRespondingId(currentAssignment.id);
            const { error } = await supabase.rpc('remove_gc_management_assignment', {
              p_assignment_id: currentAssignment.id,
            });
            if (error) {
              Alert.alert('Could not remove GC', error.message);
            } else {
              await fetchData();
            }
            setRespondingId(null);
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
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-left" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.headerBody}>
              <Text style={styles.title}>Concierge GC</Text>
              <Text style={styles.subtitle}>Invite project management help while keeping homeowner approval control.</Text>
            </View>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.sectionTitle}>Homeowner control</Text>
            <Text style={styles.bodyText}>
              A GC can recommend materials, trades, schedule changes, permits, inspections, and change orders. They cannot approve spending, release escrow, or change scope without your approval.
            </Text>
          </GlassCard>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Concierge unavailable</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading concierge options...</Text>
            </GlassCard>
          ) : assignedGc && currentAssignment ? (
            <>
              <GlassCard style={styles.card}>
                <View style={styles.gcHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{assignedGc.business_name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.gcBody}>
                    <Text style={styles.gcName}>{assignedGc.business_name}</Text>
                    <Text style={styles.gcMeta}>{[assignedGc.city, assignedGc.province].filter(Boolean).join(', ') || 'Location pending'}</Text>
                  </View>
                  <StatusBadge
                    label={formatStatusLabel(currentAssignment.status)}
                    variant={gcAssignmentStatusVariant(currentAssignment.status)}
                    dot
                  />
                </View>
                <View style={styles.termsRow}>
                  <Text style={styles.termText}>{Number(currentAssignment.markup_pct).toFixed(0)}% markup</Text>
                  <Text style={styles.termText}>{Number(currentAssignment.concierge_fee_pct).toFixed(0)}% concierge fee</Text>
                </View>
                <View style={styles.projectContext}>
                  <Text style={styles.projectContextLabel}>Project</Text>
                  <Text style={styles.projectContextValue}>{formatGcProjectType(currentAssignment.project_type)}</Text>
                  {currentAssignment.scope_summary ? (
                    <Text style={styles.projectContextSummary}>{currentAssignment.scope_summary}</Text>
                  ) : null}
                </View>
                {currentAssignment.status === 'invited' && currentAssignment.initiated_by_gc ? (
                  <GlassButton
                    label="Confirm GC Management"
                    onPress={handleConfirmGcManagement}
                    loading={respondingId === currentAssignment.id}
                    fullWidth
                    size="sm"
                    style={styles.inviteButton}
                  />
                ) : currentAssignment.status === 'invited' ? (
                  <Text style={styles.waitingText}>Waiting for the GC to accept your invite.</Text>
                ) : null}
                {currentAssignment.status !== 'completed' ? (
                  <GlassButton
                    label="Remove GC Management"
                    onPress={handleRemoveGcManagement}
                    loading={respondingId === currentAssignment.id}
                    fullWidth
                    size="sm"
                    variant="destructive"
                    style={styles.removeAssignmentButton}
                  />
                ) : null}
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Concierge service requests</Text>
                <Text style={styles.bodyText}>
                  Virtual consults and site visits use fixed marketplace pricing. Contractor payout is 80%; WalkerAI keeps 20%.
                </Text>
                {bookingRequests.length === 0 ? (
                  <Text style={styles.emptySubText}>No concierge consultation requests yet.</Text>
                ) : bookingRequests.map((booking) => (
                  <View key={booking.id} style={styles.approvalItem}>
                    <View style={styles.approvalHeader}>
                      <View style={styles.approvalIcon}>
                        <Icon
                          name={booking.status === 'accepted' ? 'calendar-check-outline' : booking.status === 'rejected' ? 'calendar-remove-outline' : 'calendar-clock-outline'}
                          size={18}
                          color={booking.status === 'accepted' ? Colors.success : booking.status === 'rejected' ? Colors.error : Colors.warning}
                        />
                      </View>
                      <View style={styles.approvalBody}>
                        <Text style={styles.approvalTitle}>{booking.title}</Text>
                        <Text style={styles.approvalMeta}>
                          {formatCadCents(booking.price_cents)} · GC {formatCadCents(booking.contractor_payout_cents)} · WalkerAI {formatCadCents(booking.walker_fee_cents)}
                        </Text>
                        <Text style={styles.approvalMeta}>
                          Payment: {formatStatusLabel(booking.payment_status ?? 'unpaid')}
                        </Text>
                      </View>
                      <StatusBadge label={formatStatusLabel(booking.status)} variant={['accepted', 'completed'].includes(booking.status) ? 'completed' : booking.status === 'rejected' ? 'error' : 'pending'} size="sm" />
                    </View>
                    {booking.status === 'accepted' && booking.payment_status !== 'paid' ? (
                      <GlassButton
                        label={booking.payment_status === 'payment_pending' ? 'Continue Payment' : 'Pay Booking'}
                        onPress={() => handlePayBooking(booking)}
                        loading={payingBookingId === booking.id}
                        disabled={!!payingBookingId}
                        fullWidth
                        size="sm"
                        style={styles.inviteButton}
                      />
                    ) : booking.payment_status === 'paid' && booking.status === 'accepted' ? (
                      <>
                        <Text style={styles.paidText}>Paid{booking.paid_at ? ` · ${new Date(booking.paid_at).toLocaleDateString('en-CA')}` : ''}</Text>
                        <GlassButton
                          label="Confirm Complete & Release Payout"
                          onPress={() => handleReleaseBookingPayout(booking)}
                          loading={releasingBookingId === booking.id}
                          disabled={!!releasingBookingId}
                          fullWidth
                          size="sm"
                          style={styles.inviteButton}
                        />
                      </>
                    ) : booking.status === 'completed' && booking.stripe_transfer_id ? (
                      <Text style={styles.paidText}>
                        Payout released{booking.payout_released_at ? ` · ${new Date(booking.payout_released_at).toLocaleDateString('en-CA')}` : ''}
                      </Text>
                    ) : null}
                  </View>
                ))}
                {assignedGcCanRequestConcierge ? (
                  <View style={styles.serviceGrid}>
                    {CONCIERGE_SERVICE_OPTIONS.map((option) => (
                      <GlassButton
                        key={option.kind}
                        label={`${option.label} · ${option.price}`}
                        onPress={() => handleRequestBooking(assignedGc, option.kind)}
                        loading={bookingId === `${assignedGc.id}:${option.kind}`}
                        variant="secondary"
                        size="sm"
                        style={styles.serviceButton}
                      />
                    ))}
                  </View>
                ) : assignedGc.concierge_enabled ? (
                  <Text style={styles.emptySubText}>
                    WalkerAI verification is required before this GC can accept new concierge service requests.
                  </Text>
                ) : null}
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Payment requests</Text>
                <Text style={styles.bodyText}>
                  Approving a GC payment request records your authorization. It does not bypass milestone escrow release.
                </Text>
                {paymentRequests.length === 0 ? (
                  <Text style={styles.emptySubText}>No GC payment requests yet.</Text>
                ) : paymentRequests.map((request) => {
                  const pending = request.status === 'pending';
                  const responding = respondingId === request.id;
                  return (
                    <View key={request.id} style={styles.approvalItem}>
                      <View style={styles.approvalHeader}>
                        <View style={styles.approvalIcon}>
                          <Icon
                            name={request.status === 'approved' ? 'check-circle-outline' : request.status === 'rejected' ? 'close-circle-outline' : 'clock-outline'}
                            size={18}
                            color={request.status === 'approved' ? Colors.success : request.status === 'rejected' ? Colors.error : Colors.warning}
                          />
                        </View>
                        <View style={styles.approvalBody}>
                          <Text style={styles.approvalTitle}>{request.title}</Text>
                          <Text style={styles.approvalMeta}>
                            {formatStatusLabel(request.request_kind)} · {formatCadCents(request.amount_cents)}
                          </Text>
                        </View>
                        <StatusBadge label={formatStatusLabel(request.status)} variant={pending ? 'pending' : request.status === 'approved' ? 'completed' : 'error'} size="sm" />
                      </View>
                      {request.description ? <Text style={styles.approvalDescription}>{request.description}</Text> : null}
                      {pending ? (
                        <>
                          {!canApproveGcPaymentRequests ? (
                            <Text style={styles.emptySubText}>
                              Active verified GC management is required before this payment request can be approved.
                            </Text>
                          ) : null}
                          <View style={styles.approvalActions}>
                            <GlassButton
                              label="Approve"
                              onPress={() => handlePaymentResponse(request, 'approved')}
                              loading={responding}
                              disabled={!canApproveGcPaymentRequests}
                              size="sm"
                              style={styles.approvalButton}
                            />
                            <GlassButton
                              label="Reject"
                              onPress={() => handlePaymentResponse(request, 'rejected')}
                              loading={responding}
                              variant="destructive"
                              size="sm"
                              style={styles.approvalButton}
                            />
                          </View>
                        </>
                      ) : null}
                    </View>
                  );
                })}
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Approval requests</Text>
                <Text style={styles.bodyText}>
                  Review GC recommendations before they change project budget, terms, materials, trades, schedule, or completion status. Supplier orders and escrow payments stay in their existing workflows.
                </Text>
                {approvalRequests.length === 0 ? (
                  <Text style={styles.emptySubText}>No GC approval requests yet.</Text>
                ) : approvalRequests.map((request) => {
                  const pending = request.status === 'pending';
                  const responding = respondingId === request.id;
                  return (
                    <View key={request.id} style={styles.approvalItem}>
                      <View style={styles.approvalHeader}>
                        <View style={styles.approvalIcon}>
                          <Icon
                            name={request.status === 'approved' ? 'check-circle-outline' : request.status === 'rejected' ? 'close-circle-outline' : 'clock-outline'}
                            size={18}
                            color={request.status === 'approved' ? Colors.success : request.status === 'rejected' ? Colors.error : Colors.warning}
                          />
                        </View>
                        <View style={styles.approvalBody}>
                          <Text style={styles.approvalTitle}>{request.title}</Text>
                          <Text style={styles.approvalMeta}>
                            {formatStatusLabel(request.request_type)}
                            {request.cost_delta != null ? ` · ${formatSignedCadCents(request.cost_delta)}` : ''}
                            {request.timeline_delta_days != null ? ` · ${request.timeline_delta_days > 0 ? '+' : ''}${request.timeline_delta_days} days` : ''}
                          </Text>
                        </View>
                        <StatusBadge label={formatStatusLabel(request.status)} variant={pending ? 'pending' : request.status === 'approved' ? 'completed' : 'error'} size="sm" />
                      </View>
                      {request.description ? <Text style={styles.approvalDescription}>{request.description}</Text> : null}
                      {getApprovalDetailRows(request).map((row) => (
                        <Text key={row} style={styles.approvalDetail}>{row}</Text>
                      ))}
                      {pending ? (
                        <View style={styles.approvalActions}>
                          <GlassButton
                            label="Approve"
                            onPress={() => handleApprovalResponse(request, 'approved')}
                            loading={responding}
                            size="sm"
                            style={styles.approvalButton}
                          />
                          <GlassButton
                            label="Reject"
                            onPress={() => handleApprovalResponse(request, 'rejected')}
                            loading={responding}
                            variant="destructive"
                            size="sm"
                            style={styles.approvalButton}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </GlassCard>
            </>
          ) : generalContractors.length === 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>No verified GCs yet</Text>
              <Text style={styles.bodyText}>
                Verified GC accounts will appear here once they complete review.
              </Text>
            </GlassCard>
          ) : (
            generalContractors.map((gc) => (
              <GlassCard key={gc.id} style={styles.card}>
                <View style={styles.gcHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{gc.business_name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.gcBody}>
                    <Text style={styles.gcName}>{gc.business_name}</Text>
                    <Text style={styles.gcMeta}>
                      {[gc.city, gc.province].filter(Boolean).join(', ') || 'Location pending'}
                      {formatGcDistance(gc) ? ` · ${formatGcDistance(gc)}` : ''}
                      {gc.rating != null ? ` · ${gc.rating.toFixed(1)} (${gc.total_reviews})` : ' · New'}
                    </Text>
                  </View>
                  <StatusBadge label="Verified" variant="completed" size="sm" dot />
                </View>
                <View style={styles.termsRow}>
                  <Text style={styles.termText}>{Number(gc.default_markup_pct).toFixed(0)}% markup</Text>
                  <Text style={styles.termText}>{Number(gc.default_concierge_fee_pct).toFixed(0)}% concierge fee</Text>
                  <Text style={styles.termText}>{gc.concierge_enabled ? 'Concierge marketplace' : 'Project management only'}</Text>
                </View>
                {gc.concierge_enabled ? (
                  <View style={styles.serviceGrid}>
                    {CONCIERGE_SERVICE_OPTIONS.map((option) => (
                      <GlassButton
                        key={option.kind}
                        label={`${option.label} · ${option.price}`}
                        onPress={() => handleRequestBooking(gc, option.kind)}
                        loading={bookingId === `${gc.id}:${option.kind}`}
                        variant="secondary"
                        size="sm"
                        style={styles.serviceButton}
                      />
                    ))}
                  </View>
                ) : null}
                <GlassButton
                  label={invitingId === gc.id ? 'Inviting...' : 'Invite GC'}
                  onPress={() => handleInvite(gc)}
                  loading={invitingId === gc.id}
                  fullWidth
                  size="sm"
                  style={styles.inviteButton}
                />
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
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  emptySubText: { ...Typography.bodySecondary, lineHeight: 22, marginTop: 10 },
  gcHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,107,0,0.12)',
    borderWidth: 1,
    borderColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.accent, fontSize: 18, fontWeight: '800' },
  gcBody: { flex: 1 },
  gcName: { ...Typography.h3, marginBottom: 3 },
  gcMeta: { ...Typography.caption },
  termsRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  termText: {
    color: Colors.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: Colors.surface.default,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  projectContext: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    padding: 12,
  },
  projectContextLabel: { ...Typography.caption, color: Colors.text.tertiary, textTransform: 'uppercase', fontWeight: '800' },
  projectContextValue: { ...Typography.body, color: Colors.text.primary, fontWeight: '900', marginTop: 4 },
  projectContextSummary: { ...Typography.bodySecondary, marginTop: 6, lineHeight: 20 },
  inviteButton: { marginTop: Spacing.sm },
  removeAssignmentButton: { marginTop: Spacing.sm },
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  serviceButton: { flexGrow: 1, minWidth: '47%' },
  waitingText: { ...Typography.caption, color: Colors.warning, marginTop: Spacing.sm, fontWeight: '700' },
  approvalItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  approvalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  approvalIcon: { width: 24, alignItems: 'center', paddingTop: 2 },
  approvalBody: { flex: 1 },
  approvalTitle: { ...Typography.body, fontWeight: '800' },
  approvalMeta: { ...Typography.caption, marginTop: 3 },
  paidText: { ...Typography.caption, color: Colors.success, marginTop: Spacing.sm, fontWeight: '800' },
  approvalDescription: { ...Typography.bodySecondary, lineHeight: 21, marginTop: 8 },
  approvalDetail: { ...Typography.caption, color: Colors.text.primary, marginTop: 6, fontWeight: '800' },
  approvalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approvalButton: { flex: 1 },
});
