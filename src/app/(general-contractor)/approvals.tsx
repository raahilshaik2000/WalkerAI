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
import { useAuthStore } from '@/stores/auth.store';
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { formatCadCents } from '@/lib/currency';
import type { GcConciergeBooking } from '@/types/database.types';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground, GlassButton, GlassCard, StatusBadge } from '@/components/ui';
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
  project?: ProjectJoin;
}

function getProject(row: { project?: ProjectJoin }) {
  return Array.isArray(row.project) ? row.project[0] ?? null : row.project ?? null;
}

function formatRoom(roomType?: string | null) {
  if (!roomType) return 'Renovation';
  return `${roomType.charAt(0).toUpperCase()}${roomType.slice(1)} Renovation`;
}

export default function GeneralContractorApprovals() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [recommendationRequests, setRecommendationRequests] = useState<RecommendationApprovalRow[]>([]);
  const [bookingRequests, setBookingRequests] = useState<GcConciergeBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingBookingId, setRespondingBookingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to view approvals.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const { data: gc, error: profileError } = await supabase
        .from('general_contractors')
        .select('id')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!gc?.id) {
        setApprovals([]);
        setRecommendationRequests([]);
        setBookingRequests([]);
        return;
      }

      const [assignmentResult, bookingResult, recommendationResult] = await Promise.all([
        supabase
          .from('general_contractor_projects')
          .select('project_id')
          .eq('general_contractor_id', gc.id)
          .neq('status', 'removed'),
        supabase
          .from('gc_concierge_bookings')
          .select('id, project_id, general_contractor_id, homeowner_id, service_kind, title, duration_minutes, price_cents, contractor_payout_cents, walker_fee_cents, status, response_note, created_at, responded_at')
          .eq('general_contractor_id', gc.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_approval_requests')
          .select(`
            id, project_id, request_type, title, cost_delta, timeline_delta_days, status,
            project:projects ( room_type, city, address )
          `)
          .eq('requested_by_gc_id', gc.id)
          .order('created_at', { ascending: false }),
      ]);
      const assignments = assignmentResult.data;
      const assignmentError = assignmentResult.error;
      if (assignmentError) throw assignmentError;
      if (bookingResult.error) throw bookingResult.error;
      if (recommendationResult.error) throw recommendationResult.error;
      setBookingRequests((bookingResult.data ?? []) as GcConciergeBooking[]);
      setRecommendationRequests((recommendationResult.data ?? []) as RecommendationApprovalRow[]);

      const projectIds = (assignments ?? []).map((row) => row.project_id).filter(Boolean);
      if (projectIds.length === 0) {
        setApprovals([]);
        return;
      }

      const { data, error } = await supabase
        .from('change_orders')
        .select(`
          id, description, cost_delta, status, signed_by_homeowner, signed_by_company, project_id,
          project:projects ( room_type, city, address )
        `)
        .in('project_id', projectIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setApprovals((data ?? []) as ApprovalRow[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load approvals.');
      setApprovals([]);
      setRecommendationRequests([]);
      setBookingRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

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
    Alert.alert(
      status === 'accepted' ? 'Accept concierge request?' : 'Reject concierge request?',
      status === 'accepted'
        ? 'This confirms the consultation request. Payment collection is still handled separately from this booking record.'
        : 'This marks the consultation request as rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'accepted' ? 'Accept' : 'Reject',
          style: status === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setRespondingBookingId(booking.id);
            const { error } = await supabase.rpc('respond_to_gc_concierge_booking', {
              p_booking_id: booking.id,
              p_status: status,
              p_response_note: null,
            });
            if (error) {
              Alert.alert('Could not respond', error.message);
            } else {
              await fetchData();
            }
            setRespondingBookingId(null);
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
          ) : approvals.length === 0 && recommendationRequests.length === 0 && bookingRequests.length === 0 ? (
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
                            <Text style={styles.projectMeta}>
                              {formatCadCents(booking.price_cents)} · Your payout {formatCadCents(booking.contractor_payout_cents)} · WalkerAI {formatCadCents(booking.walker_fee_cents)}
                            </Text>
                          </View>
                          <StatusBadge label={formatStatusLabel(booking.status)} variant={pending ? 'pending' : booking.status === 'accepted' ? 'completed' : 'error'} dot />
                        </View>
                        {pending ? (
                          <View style={styles.bookingActions}>
                            <GlassButton
                              label="Accept"
                              onPress={() => handleBookingResponse(booking, 'accepted')}
                              loading={responding}
                              size="sm"
                              style={styles.bookingButton}
                            />
                            <GlassButton
                              label="Reject"
                              onPress={() => handleBookingResponse(booking, 'rejected')}
                              loading={responding}
                              variant="destructive"
                              size="sm"
                              style={styles.bookingButton}
                            />
                          </View>
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
                                {formatRoom(project?.room_type)} · {project?.city || project?.address || 'Managed project'}
                              </Text>
                            </View>
                            <StatusBadge label={formatStatusLabel(request.status)} variant={pending ? 'pending' : request.status === 'approved' ? 'completed' : 'error'} dot />
                          </View>
                          <Text style={styles.costText}>
                            {formatStatusLabel(request.request_type)}
                            {request.cost_delta != null ? ` · ${formatCad(request.cost_delta)}` : ''}
                            {request.timeline_delta_days != null ? ` · ${request.timeline_delta_days > 0 ? '+' : ''}${request.timeline_delta_days} days` : ''}
                          </Text>
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
                          <Text style={styles.projectTitle}>{formatRoom(project?.room_type)}</Text>
                          <Text style={styles.projectMeta}>{project?.city || project?.address || 'Managed project'}</Text>
                        </View>
                        <StatusBadge label={formatStatusLabel(approval.status)} variant={needsHomeowner ? 'pending' : approval.status === 'approved' ? 'completed' : 'neutral'} dot />
                      </View>
                      <Text style={styles.description}>{approval.description}</Text>
                      {approval.cost_delta != null ? (
                        <Text style={styles.costText}>Documented cost change: {formatCad(Math.abs(approval.cost_delta))}</Text>
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
  waitingText: { ...Typography.caption, color: Colors.warning, marginTop: 8, fontWeight: '700' },
  bodyText: { ...Typography.bodySecondary },
  bookingItem: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  bookingActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  bookingButton: { flex: 1 },
});
