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
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { formatSignedCadCents, parseSignedCadToCents } from '@/lib/currency';
import { calculateGcMarkup } from '@/lib/gc-markup';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground, GlassButton, GlassCard, GlassInput, StatusBadge } from '@/components/ui';
import { TradeMetricStrip } from '@/components/company/TradeUI';
import type { ApprovalRequestType } from '@/constants/enums';

interface ProjectDetail {
  id: string;
  address: string | null;
  city: string | null;
  room_type: string | null;
  status: string;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  questionnaire_answers: Record<string, unknown> | null;
  created_at: string;
}

interface Slot {
  id: string;
  trade_type: string;
  status: string;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  external_trade_name?: string | null;
  external_trade_company?: string | null;
  external_trade_verification_status?: 'unverified' | 'documents_uploaded' | 'walker_verified' | null;
  assigned_company?: { name: string | null } | Array<{ name: string | null }> | null;
}

interface ChangeOrder {
  id: string;
  description: string;
  cost_delta: number | null;
  status: string;
  signed_by_homeowner: boolean;
  signed_by_company: boolean;
}

interface Assignment {
  id: string;
  status: string;
  markup_pct: number;
  concierge_fee_pct: number;
  scope_summary: string | null;
  initiated_by_gc: boolean;
}

interface ApprovalRequest {
  id: string;
  request_type: ApprovalRequestType;
  title: string;
  description: string | null;
  cost_delta: number | null;
  timeline_delta_days: number | null;
  status: string;
  response_note: string | null;
  created_at: string;
}

const APPROVAL_TYPES: Array<{ value: ApprovalRequestType; label: string }> = [
  { value: 'general_recommendation', label: 'General' },
  { value: 'scope_change', label: 'Scope' },
  { value: 'material_substitution', label: 'Material' },
  { value: 'trade_substitution', label: 'Trade' },
  { value: 'schedule_change', label: 'Schedule' },
  { value: 'payment_release', label: 'Payment' },
  { value: 'change_order', label: 'Change order' },
];

function projectStatusVariant(status: string): 'active' | 'completed' | 'pending' | 'dispatching' | 'neutral' {
  if (status === 'completed') return 'completed';
  if (status === 'dispatching') return 'dispatching';
  if (status === 'draft' || status === 'brief_ready' || status === 'scheduling' || status === 'quoting') return 'pending';
  if (status === 'accepted' || status === 'active') return 'active';
  return 'neutral';
}

function formatRoom(roomType?: string | null) {
  if (!roomType) return 'Renovation';
  return `${roomType.charAt(0).toUpperCase()}${roomType.slice(1)} Renovation`;
}

function formatTrade(tradeType: string) {
  return tradeType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getCompanyName(slot: Slot) {
  const company = Array.isArray(slot.assigned_company) ? slot.assigned_company[0] : slot.assigned_company;
  return company?.name ?? null;
}

export default function GeneralContractorProjectDetail() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [approvalType, setApprovalType] = useState<ApprovalRequestType>('general_recommendation');
  const [approvalTitle, setApprovalTitle] = useState('');
  const [approvalDescription, setApprovalDescription] = useState('');
  const [approvalCostDelta, setApprovalCostDelta] = useState('');
  const [approvalTimelineDelta, setApprovalTimelineDelta] = useState('');
  const [externalSlotId, setExternalSlotId] = useState<string | null>(null);
  const [externalTradeName, setExternalTradeName] = useState('');
  const [externalTradeCompany, setExternalTradeCompany] = useState('');
  const [externalTradeEmail, setExternalTradeEmail] = useState('');
  const [externalTradePhone, setExternalTradePhone] = useState('');
  const [externalTradeNotes, setExternalTradeNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [savingExternalTrade, setSavingExternalTrade] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const currentUser = (await supabase.auth.getUser()).data.user;
      const { data: gc, error: gcError } = currentUser?.id
        ? await supabase.from('general_contractors').select('id').eq('user_id', currentUser.id).maybeSingle()
        : { data: null, error: null };
      if (gcError) throw gcError;

      const [projectResult, slotResult, changeOrderResult, approvalResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, address, city, room_type, status, ai_cost_min, ai_cost_max, questionnaire_answers, created_at')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('project_slots')
          .select(`
            id, trade_type, status, fulfillment_type,
            external_trade_name, external_trade_company, external_trade_verification_status,
            assigned_company:companies!assigned_company_id(name)
          `)
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase
          .from('change_orders')
          .select('id, description, cost_delta, status, signed_by_homeowner, signed_by_company')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_approval_requests')
          .select('id, request_type, title, description, cost_delta, timeline_delta_days, status, response_note, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (slotResult.error) throw slotResult.error;
      if (changeOrderResult.error) throw changeOrderResult.error;
      if (approvalResult.error) throw approvalResult.error;

      setProject(projectResult.data as ProjectDetail | null);
      setSlots((slotResult.data ?? []) as Slot[]);
      setChangeOrders((changeOrderResult.data ?? []) as ChangeOrder[]);
      setApprovalRequests((approvalResult.data ?? []) as ApprovalRequest[]);

      if (gc?.id) {
        const { data: assignmentRow, error: assignmentError } = await supabase
          .from('general_contractor_projects')
          .select('id, status, markup_pct, concierge_fee_pct, scope_summary, initiated_by_gc')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .maybeSingle();
        if (assignmentError) throw assignmentError;
        setAssignment(assignmentRow as Assignment | null);
      } else {
        setAssignment(null);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load managed project.');
      setProject(null);
      setAssignment(null);
      setSlots([]);
      setChangeOrders([]);
      setApprovalRequests([]);
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

  const handleAcceptInvite = async () => {
    if (!assignment?.id) return;
    Alert.alert(
      'Accept management invite?',
      'This activates your GC workspace for the project. The homeowner still approves all major decisions before they take effect.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setAccepting(true);
            const { error } = await supabase
              .from('general_contractor_projects')
              .update({ status: 'active' })
              .eq('id', assignment.id);
            if (error) {
              Alert.alert('Could not accept invite', error.message);
            } else {
              await fetchData();
            }
            setAccepting(false);
          },
        },
      ],
    );
  };

  const handleSubmitApprovalRequest = async () => {
    if (!assignment?.id || assignment.status !== 'active') {
      Alert.alert('Active GC assignment required', 'Accept the management invite before sending approval requests.');
      return;
    }
    if (!approvalTitle.trim()) {
      Alert.alert('Title required', 'Add a short title for the homeowner approval request.');
      return;
    }

    const costDelta = approvalCostDelta.trim()
      ? parseSignedCadToCents(approvalCostDelta)
      : null;
    if (approvalCostDelta.trim() && costDelta == null) {
      Alert.alert('Invalid cost impact', 'Use a valid CAD amount such as 500, -250, or 125.50.');
      return;
    }

    let timelineDelta: number | null = null;
    if (approvalTimelineDelta.trim()) {
      if (!/^-?\d+$/.test(approvalTimelineDelta.trim())) {
        Alert.alert('Invalid timeline impact', 'Use whole days, such as 3 or -2.');
        return;
      }
      timelineDelta = Number(approvalTimelineDelta.trim());
      if (!Number.isSafeInteger(timelineDelta) || Math.abs(timelineDelta) > 365) {
        Alert.alert('Invalid timeline impact', 'Timeline impact must be between -365 and 365 days.');
        return;
      }
    }

    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id) {
      Alert.alert('Sign in required', 'Please sign in again before submitting approval requests.');
      return;
    }

    setSubmittingApproval(true);
    try {
      const { data: gc, error: gcError } = await supabase
        .from('general_contractors')
        .select('id')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');
      if (!project?.id) throw new Error('Project not loaded.');

      const { data: projectRow, error: projectError } = await supabase
        .from('projects')
        .select('homeowner_id')
        .eq('id', project.id)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!projectRow?.homeowner_id) throw new Error('Project homeowner not found.');

      const { error } = await supabase.from('project_approval_requests').insert({
        project_id: project.id,
        requested_by_gc_id: gc.id,
        homeowner_id: projectRow.homeowner_id,
        request_type: approvalType,
        title: approvalTitle.trim(),
        description: approvalDescription.trim() || null,
        cost_delta: costDelta,
        timeline_delta_days: timelineDelta,
      });
      if (error) throw error;

      setApprovalTitle('');
      setApprovalDescription('');
      setApprovalCostDelta('');
      setApprovalTimelineDelta('');
      setApprovalType('general_recommendation');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not submit approval request', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmittingApproval(false);
    }
  };

  const startExternalTrade = (slot: Slot) => {
    setExternalSlotId(slot.id);
    setExternalTradeName(slot.external_trade_name ?? '');
    setExternalTradeCompany(slot.external_trade_company ?? '');
    setExternalTradeEmail('');
    setExternalTradePhone('');
    setExternalTradeNotes('');
  };

  const handleSaveExternalTrade = async () => {
    if (!externalSlotId) return;
    if (!externalTradeName.trim()) {
      Alert.alert('Trade name required', 'Enter the external trade contact name.');
      return;
    }

    setSavingExternalTrade(true);
    try {
      const { error } = await supabase.rpc('mark_project_slot_externally_managed', {
        p_slot_id: externalSlotId,
        p_trade_name: externalTradeName.trim(),
        p_trade_company: externalTradeCompany.trim() || null,
        p_trade_email: externalTradeEmail.trim() || null,
        p_trade_phone: externalTradePhone.trim() || null,
        p_verification_status: 'unverified',
        p_notes: externalTradeNotes.trim() || null,
      });
      if (error) throw error;
      setExternalSlotId(null);
      setExternalTradeName('');
      setExternalTradeCompany('');
      setExternalTradeEmail('');
      setExternalTradePhone('');
      setExternalTradeNotes('');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not mark external trade', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSavingExternalTrade(false);
    }
  };

  const estimate = project?.ai_cost_min != null && project.ai_cost_max != null
    ? `${formatCad(project.ai_cost_min)} - ${formatCad(project.ai_cost_max)}`
    : project?.ai_cost_max != null || project?.ai_cost_min != null
    ? formatCad(project.ai_cost_max ?? project.ai_cost_min ?? 0)
    : 'Pending';
  const pendingApprovals = changeOrders.filter((order) => (
    order.status === 'proposed' && order.signed_by_company && !order.signed_by_homeowner
  )).length;
  const assignedTrades = slots.filter((slot) => !!getCompanyName(slot)).length;
  const markupSummary = assignment && project
    ? calculateGcMarkup({
      baseMinCents: project.ai_cost_min,
      baseMaxCents: project.ai_cost_max,
      markupPct: Number(assignment.markup_pct),
      conciergeFeePct: Number(assignment.concierge_fee_pct),
    })
    : null;

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
              <Text style={styles.title}>{formatRoom(project?.room_type)}</Text>
              <Text style={styles.subtitle}>{project?.city || project?.address || 'Managed project'}</Text>
            </View>
            {project?.status ? (
              <StatusBadge label={formatStatusLabel(project.status)} variant={projectStatusVariant(project.status)} dot />
            ) : null}
          </View>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Project unavailable</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading managed project...</Text>
            </GlassCard>
          ) : (
            <>
              <TradeMetricStrip
                items={[
                  { label: 'Estimate', value: estimate, tone: project?.ai_cost_min || project?.ai_cost_max ? 'success' : 'muted' },
                  { label: 'Trades', value: `${assignedTrades}/${slots.length}`, tone: assignedTrades ? 'success' : 'muted' },
                  { label: 'Approvals', value: pendingApprovals, tone: pendingApprovals ? 'warning' : 'muted' },
                ]}
              />

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Homeowner authority</Text>
                <Text style={styles.bodyText}>
                  GC recommendations do not change scope, spending, trades, payment releases, or schedule until the homeowner approves them.
                </Text>
              </GlassCard>

              {assignment ? (
                <GlassCard style={styles.card}>
                  <View style={styles.assignmentHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>GC management terms</Text>
                      <Text style={styles.bodyText}>
                        {Number(assignment.markup_pct).toFixed(0)}% markup · {Number(assignment.concierge_fee_pct).toFixed(0)}% concierge fee
                      </Text>
                    </View>
                    <StatusBadge
                      label={formatStatusLabel(assignment.status)}
                      variant={assignment.status === 'active' ? 'active' : 'pending'}
                      dot
                    />
                  </View>
                  {assignment.scope_summary ? <Text style={styles.scopeText}>{assignment.scope_summary}</Text> : null}
                  {assignment.status === 'invited' && !assignment.initiated_by_gc ? (
                    <TouchableOpacity
                      style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
                      onPress={handleAcceptInvite}
                      disabled={accepting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.acceptButtonText}>{accepting ? 'Accepting...' : 'Accept Management Invite'}</Text>
                    </TouchableOpacity>
                  ) : assignment.status === 'invited' && assignment.initiated_by_gc ? (
                    <Text style={styles.pendingHomeownerText}>
                      Waiting for the homeowner to confirm GC management before recommendations can be sent.
                    </Text>
                  ) : null}
                </GlassCard>
              ) : null}

              {assignment ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Markup engine</Text>
                  {markupSummary ? (
                    <>
                      <BudgetRow
                        label="AI budget basis"
                        value={`${formatCad(markupSummary.baseMinCents)} - ${formatCad(markupSummary.baseMaxCents)}`}
                      />
                      <BudgetRow
                        label={`GC markup (${Number(assignment.markup_pct).toFixed(0)}%)`}
                        value={`${formatCad(markupSummary.markupMinCents)} - ${formatCad(markupSummary.markupMaxCents)}`}
                      />
                      <BudgetRow
                        label={`Concierge fee (${Number(assignment.concierge_fee_pct).toFixed(0)}%)`}
                        value={`${formatCad(markupSummary.conciergeFeeMinCents)} - ${formatCad(markupSummary.conciergeFeeMaxCents)}`}
                      />
                      <BudgetRow
                        label="Homeowner-facing total"
                        value={`${formatCad(markupSummary.homeownerTotalMinCents)} - ${formatCad(markupSummary.homeownerTotalMaxCents)}`}
                        strong
                      />
                      <BudgetRow
                        label="Estimated GC revenue"
                        value={`${formatCad(markupSummary.gcRevenueMinCents)} - ${formatCad(markupSummary.gcRevenueMaxCents)}`}
                        positive
                      />
                    </>
                  ) : (
                    <Text style={styles.bodyText}>
                      Generate or enter an estimate before WalkerAI can calculate markup, homeowner total, and GC revenue.
                    </Text>
                  )}
                </GlassCard>
              ) : null}

              {assignment?.status === 'active' ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Request homeowner approval</Text>
                  <Text style={styles.bodyText}>
                    Use this for recommendations. Nothing changes until the homeowner approves.
                  </Text>
                  <View style={styles.typeGrid}>
                    {APPROVAL_TYPES.map((type) => {
                      const selected = approvalType === type.value;
                      return (
                        <TouchableOpacity
                          key={type.value}
                          style={[styles.typeChip, selected && styles.typeChipActive]}
                          onPress={() => setApprovalType(type.value)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.typeChipText, selected && styles.typeChipTextActive]}>
                            {type.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <GlassInput
                    label="Request title"
                    value={approvalTitle}
                    onChangeText={setApprovalTitle}
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Recommendation details"
                    value={approvalDescription}
                    onChangeText={setApprovalDescription}
                    containerStyle={styles.formInput}
                  />
                  <View style={styles.formRow}>
                    <GlassInput
                      label="Cost +/- CAD"
                      value={approvalCostDelta}
                      onChangeText={setApprovalCostDelta}
                      keyboardType="decimal-pad"
                      containerStyle={styles.formHalf}
                    />
                    <GlassInput
                      label="Days +/-"
                      value={approvalTimelineDelta}
                      onChangeText={setApprovalTimelineDelta}
                      keyboardType="numbers-and-punctuation"
                      containerStyle={styles.formHalf}
                    />
                  </View>
                  <GlassButton
                    label="Send for Homeowner Approval"
                    onPress={handleSubmitApprovalRequest}
                    loading={submittingApproval}
                    fullWidth
                    size="sm"
                    style={styles.submitApprovalButton}
                  />
                </GlassCard>
              ) : null}

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Approval requests</Text>
                {approvalRequests.length === 0 ? (
                  <Text style={styles.bodyText}>No GC approval requests yet.</Text>
                ) : approvalRequests.slice(0, 5).map((request) => (
                  <View key={request.id} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Icon
                        name={request.status === 'approved' ? 'check-circle-outline' : request.status === 'rejected' ? 'close-circle-outline' : 'clock-outline'}
                        size={18}
                        color={request.status === 'approved' ? Colors.success : request.status === 'rejected' ? Colors.error : Colors.warning}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{request.title}</Text>
                      <Text style={styles.rowSub}>
                        {formatStatusLabel(request.status)}
                        {request.cost_delta != null ? ` · ${formatSignedCadCents(request.cost_delta)}` : ''}
                        {request.timeline_delta_days != null ? ` · ${request.timeline_delta_days > 0 ? '+' : ''}${request.timeline_delta_days} days` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Trade plan</Text>
                {slots.length === 0 ? (
                  <Text style={styles.bodyText}>Trade slots have not been generated yet.</Text>
                ) : slots.map((slot) => (
                  <View key={slot.id} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Icon
                        name={slot.fulfillment_type === 'external' ? 'account-hard-hat-outline' : getCompanyName(slot) ? 'check-circle-outline' : 'circle-outline'}
                        size={18}
                        color={slot.fulfillment_type === 'external' ? Colors.warning : getCompanyName(slot) ? Colors.success : Colors.text.tertiary}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{formatTrade(slot.trade_type)}</Text>
                      <Text style={styles.rowSub}>
                        {slot.fulfillment_type === 'external'
                          ? `${slot.external_trade_name ?? 'External trade'} · Externally managed`
                          : getCompanyName(slot) ?? formatStatusLabel(slot.status)}
                      </Text>
                      {slot.fulfillment_type === 'external' ? (
                        <Text style={styles.externalWarning}>
                          Not verified by WalkerAI · No escrow protection · GC managed
                        </Text>
                      ) : null}
                      {assignment?.status === 'active' && !getCompanyName(slot) && slot.fulfillment_type !== 'external' ? (
                        <TouchableOpacity
                          style={styles.externalLink}
                          onPress={() => startExternalTrade(slot)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.externalLinkText}>Mark externally managed</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))}
              </GlassCard>

              {assignment?.status === 'active' && externalSlotId ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>External trade</Text>
                  <Text style={styles.bodyText}>
                    Use this only when the GC is managing this scope outside WalkerAI.
                  </Text>
                  <GlassInput
                    label="Trade contact name"
                    value={externalTradeName}
                    onChangeText={setExternalTradeName}
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Company"
                    value={externalTradeCompany}
                    onChangeText={setExternalTradeCompany}
                    containerStyle={styles.formInput}
                  />
                  <View style={styles.formRow}>
                    <GlassInput
                      label="Email"
                      value={externalTradeEmail}
                      onChangeText={setExternalTradeEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      containerStyle={styles.formHalf}
                    />
                    <GlassInput
                      label="Phone"
                      value={externalTradePhone}
                      onChangeText={setExternalTradePhone}
                      keyboardType="phone-pad"
                      containerStyle={styles.formHalf}
                    />
                  </View>
                  <GlassInput
                    label="Notes"
                    value={externalTradeNotes}
                    onChangeText={setExternalTradeNotes}
                    containerStyle={styles.formInput}
                  />
                  <View style={styles.externalActions}>
                    <GlassButton
                      label="Cancel"
                      onPress={() => setExternalSlotId(null)}
                      variant="secondary"
                      size="sm"
                      style={styles.externalActionButton}
                    />
                    <GlassButton
                      label="Save External Trade"
                      onPress={handleSaveExternalTrade}
                      loading={savingExternalTrade}
                      size="sm"
                      style={styles.externalActionButton}
                    />
                  </View>
                </GlassCard>
              ) : null}

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Pending homeowner decisions</Text>
                {changeOrders.length === 0 ? (
                  <Text style={styles.bodyText}>No change orders or approval requests are pending.</Text>
                ) : changeOrders.slice(0, 5).map((order) => (
                  <View key={order.id} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Icon
                        name={order.status === 'approved' ? 'check-circle-outline' : order.status === 'rejected' ? 'close-circle-outline' : 'clock-outline'}
                        size={18}
                        color={order.status === 'approved' ? Colors.success : order.status === 'rejected' ? Colors.error : Colors.warning}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{order.description}</Text>
                      <Text style={styles.rowSub}>
                        {formatStatusLabel(order.status)}
                        {order.cost_delta != null ? ` · ${formatCad(Math.abs(order.cost_delta))}` : ''}
                      </Text>
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

function BudgetRow({
  label,
  value,
  strong = false,
  positive = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  return (
    <View style={styles.budgetRow}>
      <Text style={styles.budgetLabel}>{label}</Text>
      <Text style={[styles.budgetValue, strong && styles.budgetValueStrong, positive && styles.budgetValuePositive]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.md },
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
  title: { ...Typography.h2 },
  subtitle: { ...Typography.bodySecondary, marginTop: 2 },
  card: { marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  assignmentHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  scopeText: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 10,
  },
  acceptButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  acceptButtonDisabled: { opacity: 0.65 },
  acceptButtonText: { color: Colors.accentFg, fontSize: 15, fontWeight: '800' },
  pendingHomeownerText: {
    ...Typography.caption,
    color: Colors.warning,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  budgetLabel: { ...Typography.bodySecondary, flex: 1 },
  budgetValue: { ...Typography.body, flex: 1, textAlign: 'right' },
  budgetValueStrong: { fontWeight: '900', color: Colors.text.primary },
  budgetValuePositive: { color: Colors.success, fontWeight: '800' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 12 },
  typeChip: {
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.surface.default,
  },
  typeChipActive: {
    borderColor: 'rgba(255,107,0,0.65)',
    backgroundColor: 'rgba(255,107,0,0.14)',
  },
  typeChipText: { color: Colors.text.secondary, fontSize: 12, fontWeight: '700' },
  typeChipTextActive: { color: Colors.text.primary },
  formInput: { marginBottom: Spacing.sm },
  formRow: { flexDirection: 'row', gap: 8 },
  formHalf: { flex: 1, marginBottom: Spacing.sm },
  submitApprovalButton: { marginTop: 2 },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  rowIcon: { width: 24, alignItems: 'center', paddingTop: 1 },
  rowBody: { flex: 1 },
  rowTitle: { ...Typography.body, fontWeight: '700' },
  rowSub: { ...Typography.caption, marginTop: 3 },
  externalWarning: { ...Typography.caption, color: Colors.warning, marginTop: 5, lineHeight: 17 },
  externalLink: { alignSelf: 'flex-start', marginTop: 9 },
  externalLinkText: { color: Colors.accent, fontSize: 13, fontWeight: '800' },
  externalActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  externalActionButton: { flex: 1 },
});
