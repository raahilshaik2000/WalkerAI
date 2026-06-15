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
import { useAuthStore } from '@/stores/auth.store';
import type { GeneralContractor } from '@/types/database.types';
import { formatStatusLabel } from '@/lib/formatters';
import { formatSignedCadCents } from '@/lib/currency';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

interface CurrentAssignment {
  id: string;
  status: string;
  markup_pct: number;
  concierge_fee_pct: number;
  initiated_by_gc: boolean;
  general_contractor?: Pick<GeneralContractor, 'id' | 'business_name' | 'city' | 'province' | 'rating' | 'total_reviews'> | Array<Pick<GeneralContractor, 'id' | 'business_name' | 'city' | 'province' | 'rating' | 'total_reviews'>> | null;
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
}

function getAssignedGc(row: CurrentAssignment | null) {
  if (!row) return null;
  return Array.isArray(row.general_contractor)
    ? row.general_contractor[0] ?? null
    : row.general_contractor ?? null;
}

export default function ProjectConciergeScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [projectHomeownerId, setProjectHomeownerId] = useState<string | null>(null);
  const [currentAssignment, setCurrentAssignment] = useState<CurrentAssignment | null>(null);
  const [generalContractors, setGeneralContractors] = useState<GeneralContractor[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to manage concierge support.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const [projectResult, assignmentResult, gcResult, approvalResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, homeowner_id')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('general_contractor_projects')
          .select(`
            id, status, markup_pct, concierge_fee_pct, initiated_by_gc,
            general_contractor:general_contractors ( id, business_name, city, province, rating, total_reviews )
          `)
          .eq('project_id', projectId)
          .neq('status', 'removed')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('general_contractors')
          .select('*')
          .eq('verified', true)
          .order('rating', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('project_approval_requests')
          .select('id, request_type, title, description, cost_delta, timeline_delta_days, status, response_note')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (assignmentResult.error) throw assignmentResult.error;
      if (gcResult.error) throw gcResult.error;
      if (approvalResult.error) throw approvalResult.error;

      setProjectHomeownerId(projectResult.data?.homeowner_id ?? null);
      setCurrentAssignment(assignmentResult.data as CurrentAssignment | null);
      setGeneralContractors((gcResult.data ?? []) as GeneralContractor[]);
      setApprovalRequests((approvalResult.data ?? []) as ApprovalRequest[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load concierge options.');
      setCurrentAssignment(null);
      setGeneralContractors([]);
      setApprovalRequests([]);
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

  const handleApprovalResponse = async (request: ApprovalRequest, status: 'approved' | 'rejected') => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id || projectHomeownerId !== currentUser.id) {
      Alert.alert('Not allowed', 'Only the homeowner can respond to approval requests.');
      return;
    }

    Alert.alert(
      status === 'approved' ? 'Approve request?' : 'Reject request?',
      status === 'approved'
        ? 'This records your approval. Any project updates still need to be applied by the appropriate workflow.'
        : 'This records that the recommendation was rejected.',
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
            const { error } = await supabase
              .from('general_contractor_projects')
              .update({ status: 'active' })
              .eq('id', currentAssignment.id)
              .eq('status', 'invited');
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

  const assignedGc = getAssignedGc(currentAssignment);

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
                  <StatusBadge label={formatStatusLabel(currentAssignment.status)} variant="pending" dot />
                </View>
                <View style={styles.termsRow}>
                  <Text style={styles.termText}>{Number(currentAssignment.markup_pct).toFixed(0)}% markup</Text>
                  <Text style={styles.termText}>{Number(currentAssignment.concierge_fee_pct).toFixed(0)}% concierge fee</Text>
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
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Approval requests</Text>
                {approvalRequests.length === 0 ? (
                  <Text style={styles.bodyText}>No GC approval requests yet.</Text>
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
                      {gc.rating != null ? ` · ${gc.rating.toFixed(1)} (${gc.total_reviews})` : ' · New'}
                    </Text>
                  </View>
                  <StatusBadge label="Verified" variant="completed" size="sm" dot />
                </View>
                <View style={styles.termsRow}>
                  <Text style={styles.termText}>{Number(gc.default_markup_pct).toFixed(0)}% markup</Text>
                  <Text style={styles.termText}>{Number(gc.default_concierge_fee_pct).toFixed(0)}% concierge fee</Text>
                </View>
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
  inviteButton: { marginTop: Spacing.sm },
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
  approvalDescription: { ...Typography.bodySecondary, lineHeight: 21, marginTop: 8 },
  approvalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approvalButton: { flex: 1 },
});
