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
import { formatSignedCadCents, parseSignedCadToCents } from '@/lib/currency';
import { formatStatusLabel } from '@/lib/formatters';
import { GENERAL_CONTRACTOR_READINESS_SELECT, isGeneralContractorReadyForProjectControls } from '@/lib/general-contractor';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';
import type { ApprovalRequestType } from '@/constants/enums';

interface Assignment {
  id: string;
  status: string;
  homeowner_id: string;
  general_contractor_id: string;
}

interface DiscoveryRequest {
  id: string;
  request_type: ApprovalRequestType;
  title: string;
  description: string | null;
  cost_delta: number | null;
  timeline_delta_days: number | null;
  status: string;
  created_at: string;
}

const REQUEST_TYPES: Array<{ value: ApprovalRequestType; label: string; icon: string }> = [
  { value: 'change_order', label: 'Change', icon: 'file-edit-outline' },
  { value: 'scope_change', label: 'Scope', icon: 'clipboard-text-outline' },
  { value: 'general_recommendation', label: 'Discovery', icon: 'alert-circle-outline' },
];

function statusVariant(status: string): 'pending' | 'completed' | 'error' | 'neutral' {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'error';
  if (status === 'pending') return 'pending';
  return 'neutral';
}

function parseSignedWholeDays(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function approvalResultMessage(requestType: ApprovalRequestType) {
  if (requestType === 'change_order') {
    return 'After homeowner approval, WalkerAI creates an approved project change-order record. Escrow and milestone funding still stay separate.';
  }
  return 'No discovery or scope change becomes active until the homeowner approves it.';
}

export default function GeneralContractorDiscoveryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [requests, setRequests] = useState<DiscoveryRequest[]>([]);
  const [requestType, setRequestType] = useState<ApprovalRequestType>('change_order');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [costDelta, setCostDelta] = useState('');
  const [timelineDelta, setTimelineDelta] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gcReady, setGcReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id) {
      setErrorMessage('You need to be signed in to manage discoveries.');
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
          .from('project_approval_requests')
          .select('id, request_type, title, description, cost_delta, timeline_delta_days, status, created_at')
          .eq('project_id', projectId)
          .eq('requested_by_gc_id', gc.id)
          .in('request_type', ['change_order', 'scope_change', 'general_recommendation'])
          .order('created_at', { ascending: false }),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      if (requestResult.error) throw requestResult.error;

      setAssignment(assignmentResult.data as Assignment | null);
      setRequests((requestResult.data ?? []) as DiscoveryRequest[]);
    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load discoveries.'));
      setAssignment(null);
      setRequests([]);
      setGcReady(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

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
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before discoveries can be submitted.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before discoveries can be submitted.');
      return;
    }
    if (!title.trim() || !description.trim()) {
      Alert.alert('Details required', 'Add a clear title and description for the discovery or scope change.');
      return;
    }
    const parsedCostDelta = costDelta.trim() ? parseSignedCadToCents(costDelta) : null;
    if (costDelta.trim() && parsedCostDelta == null) {
      Alert.alert('Invalid cost impact', 'Enter a signed CAD amount, like +500 or -200.');
      return;
    }
    const parsedTimelineDelta = parseSignedWholeDays(timelineDelta);
    if (timelineDelta.trim() && parsedTimelineDelta == null) {
      Alert.alert('Invalid timeline impact', 'Enter timeline impact as whole days, like 3 or -1.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('project_approval_requests').insert({
        project_id: projectId,
        requested_by_gc_id: assignment.general_contractor_id,
        homeowner_id: assignment.homeowner_id,
        request_type: requestType,
        title: title.trim(),
        description: description.trim(),
        cost_delta: parsedCostDelta,
        timeline_delta_days: parsedTimelineDelta,
        metadata: {
          source: 'gc_discovery',
          discovery_type: requestType,
        },
      });
      if (error) throw error;
      Alert.alert('Sent for approval', approvalResultMessage(requestType));
      setTitle('');
      setDescription('');
      setCostDelta('');
      setTimelineDelta('');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not submit discovery', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
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
              <Text style={styles.title}>Discovery & Changes</Text>
              <Text style={styles.subtitle}>Document hidden issues, added scope, reduced scope, or timeline impacts.</Text>
            </View>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.sectionTitle}>Homeowner approval gate</Text>
            <Text style={styles.bodyText}>
              No discovery or scope change becomes active until the homeowner approves it. Approved change-order requests create a project change-order record; escrow and milestone funding remain separate.
            </Text>
          </GlassCard>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Discoveries unavailable</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading discoveries...</Text>
            </GlassCard>
          ) : (
            <>
              {assignment?.status === 'active' && gcReady ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>New discovery</Text>
                  <View style={styles.typeGrid}>
                    {REQUEST_TYPES.map((type) => {
                      const selected = requestType === type.value;
                      return (
                        <TouchableOpacity
                          key={type.value}
                          style={[styles.typeChip, selected && styles.typeChipActive]}
                          onPress={() => setRequestType(type.value)}
                          activeOpacity={0.85}
                        >
                          <Icon name={type.icon} size={18} color={selected ? Colors.accent : Colors.text.secondary} />
                          <Text style={[styles.typeText, selected && styles.typeTextActive]}>{type.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <GlassInput label="Title" value={title} onChangeText={setTitle} containerStyle={styles.formInput} />
                  <GlassInput label="Description" value={description} onChangeText={setDescription} containerStyle={styles.formInput} />
                  <View style={styles.formRow}>
                    <GlassInput
                      label="Cost impact CAD"
                      value={costDelta}
                      onChangeText={setCostDelta}
                      keyboardType="numbers-and-punctuation"
                      containerStyle={styles.formHalf}
                    />
                    <GlassInput
                      label="Timeline days"
                      value={timelineDelta}
                      onChangeText={setTimelineDelta}
                      keyboardType="numbers-and-punctuation"
                      containerStyle={styles.formHalf}
                    />
                  </View>
                  <GlassButton label="Send for Homeowner Approval" onPress={handleSubmit} loading={submitting} fullWidth />
                </GlassCard>
              ) : assignment?.status === 'active' ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Complete setup required</Text>
                  <Text style={styles.bodyText}>
                    Complete verified GC setup is required before discoveries or scope changes can be submitted.
                  </Text>
                </GlassCard>
              ) : (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Homeowner confirmation required</Text>
                  <Text style={styles.bodyText}>
                    Discovery submissions unlock after the homeowner confirms active GC management.
                  </Text>
                </GlassCard>
              )}

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Discovery log</Text>
                {requests.length === 0 ? (
                  <Text style={styles.bodyText}>No discoveries or scope changes have been submitted yet.</Text>
                ) : requests.map((request) => (
                  <View key={request.id} style={styles.requestRow}>
                    <View style={styles.requestIcon}>
                      <Icon
                        name={request.status === 'approved' ? 'check-circle-outline' : request.status === 'rejected' ? 'close-circle-outline' : 'clock-outline'}
                        size={18}
                        color={request.status === 'approved' ? Colors.success : request.status === 'rejected' ? Colors.error : Colors.warning}
                      />
                    </View>
                    <View style={styles.requestBody}>
                      <View style={styles.requestHeader}>
                        <Text style={styles.requestTitle}>{request.title}</Text>
                        <StatusBadge label={formatStatusLabel(request.status)} variant={statusVariant(request.status)} size="sm" />
                      </View>
                      <Text style={styles.requestMeta}>
                        {formatStatusLabel(request.request_type)}
                        {request.cost_delta != null ? ` · ${formatSignedCadCents(request.cost_delta)}` : ''}
                        {request.timeline_delta_days != null ? ` · ${request.timeline_delta_days > 0 ? '+' : ''}${request.timeline_delta_days} days` : ''}
                      </Text>
                      {request.description ? <Text style={styles.requestDescription}>{request.description}</Text> : null}
                    </View>
                  </View>
                ))}
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
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  typeGrid: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
  typeChip: {
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
  typeChipActive: { borderColor: 'rgba(255,107,0,0.65)', backgroundColor: 'rgba(255,107,0,0.14)' },
  typeText: { color: Colors.text.secondary, fontSize: 12, fontWeight: '800' },
  typeTextActive: { color: Colors.text.primary },
  formInput: { marginBottom: Spacing.sm },
  formRow: { flexDirection: 'row', gap: 8 },
  formHalf: { flex: 1, marginBottom: Spacing.sm },
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
});
