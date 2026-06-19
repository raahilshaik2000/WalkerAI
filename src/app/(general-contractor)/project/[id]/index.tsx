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
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { formatSignedCadCents, parseNonNegativeCadToCents, parseSignedCadToCents } from '@/lib/currency';
import { calculateGcMarkup } from '@/lib/gc-markup';
import { formatGcProjectType } from '@/lib/gc-project-type';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { formatTradeLabel } from '@/lib/trade-labels';
import {
  GENERAL_CONTRACTOR_READINESS_SELECT,
  isGeneralContractorReadyForProjectControls,
  nextGeneralContractorOnboardingRoute,
} from '@/lib/general-contractor';
import { getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
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
  external_trade_email?: string | null;
  external_trade_phone?: string | null;
  external_trade_notes?: string | null;
  external_trade_verification_status?: 'unverified' | 'documents_uploaded' | 'walker_verified' | null;
  external_trade_document_urls?: string[] | null;
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
  homeowner_id: string;
  general_contractor_id: string;
  markup_pct: number;
  concierge_fee_pct: number;
  project_type: string | null;
  scope_summary: string | null;
  homeowner_contact_name: string | null;
  homeowner_contact_email: string | null;
  homeowner_contact_phone: string | null;
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
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function projectStatusVariant(status: string): 'active' | 'completed' | 'pending' | 'dispatching' | 'neutral' {
  if (status === 'completed') return 'completed';
  if (status === 'dispatching') return 'dispatching';
  if (status === 'draft' || status === 'brief_ready' || status === 'scheduling' || status === 'quoting') return 'pending';
  if (status === 'accepted' || status === 'active') return 'active';
  return 'neutral';
}

function assignmentStatusVariant(status: string): 'active' | 'completed' | 'pending' | 'error' | 'neutral' {
  if (status === 'active') return 'active';
  if (status === 'completed') return 'completed';
  if (status === 'invited') return 'pending';
  if (status === 'removed') return 'error';
  return 'neutral';
}

function formatTrade(tradeType: string) {
  return formatTradeLabel(tradeType) ?? 'Trade';
}

function parsePercent(value: string): number | null {
  const normalized = value.trim().replace('%', '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCompanyName(slot: Slot) {
  const company = Array.isArray(slot.assigned_company) ? slot.assigned_company[0] : slot.assigned_company;
  return company?.name ?? null;
}

function getSlotParticipantName(slot: Slot) {
  if (slot.fulfillment_type === 'external') {
    return slot.external_trade_name ?? slot.external_trade_company ?? 'External trade';
  }
  return getCompanyName(slot);
}

function getApprovalAction(request: ApprovalRequest) {
  return typeof request.metadata?.action === 'string' ? request.metadata.action : null;
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
  const [proposedBudgetMin, setProposedBudgetMin] = useState('');
  const [proposedBudgetMax, setProposedBudgetMax] = useState('');
  const [proposedMarkupPct, setProposedMarkupPct] = useState('');
  const [proposedConciergeFeePct, setProposedConciergeFeePct] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [submittingBudget, setSubmittingBudget] = useState(false);
  const [submittingTerms, setSubmittingTerms] = useState(false);
  const [cancellingApprovalId, setCancellingApprovalId] = useState<string | null>(null);
  const [savingExternalTrade, setSavingExternalTrade] = useState(false);
  const [uploadingExternalDocSlotId, setUploadingExternalDocSlotId] = useState<string | null>(null);
  const [gcVerified, setGcVerified] = useState(false);
  const [gcProfileComplete, setGcProfileComplete] = useState(false);
  const [gcReady, setGcReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearProjectDetailState = useCallback(() => {
    setProject(null);
    setAssignment(null);
    setSlots([]);
    setChangeOrders([]);
    setApprovalRequests([]);
    setApprovalTitle('');
    setApprovalDescription('');
    setApprovalCostDelta('');
    setApprovalTimelineDelta('');
    setExternalSlotId(null);
    setExternalTradeName('');
    setExternalTradeCompany('');
    setExternalTradeEmail('');
    setExternalTradePhone('');
    setExternalTradeNotes('');
    setProposedBudgetMin('');
    setProposedBudgetMax('');
    setProposedMarkupPct('');
    setProposedConciergeFeePct('');
    setAccepting(false);
    setSubmittingApproval(false);
    setSubmittingBudget(false);
    setSubmittingTerms(false);
    setCancellingApprovalId(null);
    setSavingExternalTrade(false);
    setUploadingExternalDocSlotId(null);
    setGcVerified(false);
    setGcProfileComplete(false);
    setGcReady(false);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser?.id) {
        throw new Error('You need to be signed in to view managed projects.');
      }
      const { data: gc, error: gcError } = await supabase
        .from('general_contractors')
        .select(GENERAL_CONTRACTOR_READINESS_SELECT)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');
      setGcVerified(gc.verified === true);
      setGcProfileComplete(nextGeneralContractorOnboardingRoute(gc) === null);
      setGcReady(isGeneralContractorReadyForProjectControls(gc));

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
            external_trade_name, external_trade_company, external_trade_email, external_trade_phone,
            external_trade_notes, external_trade_verification_status,
            external_trade_document_urls,
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
          .select('id, request_type, title, description, cost_delta, timeline_delta_days, status, response_note, metadata, created_at')
          .eq('project_id', projectId)
          .eq('requested_by_gc_id', gc.id)
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

      const { data: assignmentRow, error: assignmentError } = await supabase
        .from('general_contractor_projects')
        .select(`
          id, status, homeowner_id, general_contractor_id, markup_pct, concierge_fee_pct,
          project_type, scope_summary, homeowner_contact_name, homeowner_contact_email, homeowner_contact_phone,
          initiated_by_gc
        `)
        .eq('project_id', projectId)
        .eq('general_contractor_id', gc.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      setAssignment(assignmentRow as Assignment | null);
      setProposedMarkupPct(assignmentRow?.markup_pct != null ? Number(assignmentRow.markup_pct).toFixed(0) : '');
      setProposedConciergeFeePct(assignmentRow?.concierge_fee_pct != null ? Number(assignmentRow.concierge_fee_pct).toFixed(0) : '');
    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load managed project.'));
      clearProjectDetailState();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clearProjectDetailState, projectId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const gcCanManage = gcReady;

  const pendingChangeOrders = changeOrders.filter((order) => (
    order.status === 'proposed' && order.signed_by_company && !order.signed_by_homeowner
  ));
  const pendingApprovalRequests = approvalRequests.filter((request) => request.status === 'pending');
  const pendingBudgetRequest = pendingApprovalRequests.find((request) => getApprovalAction(request) === 'update_gc_budget');
  const pendingTermsRequest = pendingApprovalRequests.find((request) => getApprovalAction(request) === 'update_gc_terms');
  const pendingApprovals = pendingChangeOrders.length + pendingApprovalRequests.length;
  const pendingDecisionApprovalRequests = pendingApprovalRequests.slice(0, 5);
  const pendingDecisionChangeOrders = pendingChangeOrders.slice(0, Math.max(0, 5 - pendingDecisionApprovalRequests.length));

  const handleAcceptInvite = async () => {
    if (!assignment?.id) return;
    if (!gcVerified) {
      Alert.alert(
        'Verification required',
        'WalkerAI must verify your GC profile before you can activate project management.',
      );
      return;
    }
    if (!gcProfileComplete) {
      Alert.alert(
        'Complete GC setup',
        'Finish your GC business profile, license, and insurance setup before activating project management.',
      );
      return;
    }
    Alert.alert(
      'Accept management invite?',
      'This activates your GC workspace for the project. The homeowner still approves all major decisions before they take effect.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setAccepting(true);
            try {
              const { error } = await supabase.rpc('accept_gc_management_invite', {
                p_assignment_id: assignment.id,
              });
              if (error) {
                Alert.alert('Could not accept invite', formatAppSafeErrorMessage(error, 'Please try again.'));
                return;
              }
              await fetchData();
            } catch (err) {
              Alert.alert('Could not accept invite', formatAppSafeErrorMessage(err, 'Please try again.'));
            } finally {
              setAccepting(false);
            }
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
    if (!gcCanManage) {
      Alert.alert('Complete verified GC setup required', 'WalkerAI must verify your GC profile and your business, license, and insurance setup must be complete before approval requests can be sent.');
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
        .select(GENERAL_CONTRACTOR_READINESS_SELECT)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');
      if (gc.verified !== true) throw new Error('WalkerAI must verify your GC profile before approval requests can be sent.');
      if (nextGeneralContractorOnboardingRoute(gc)) throw new Error('Complete your GC business, license, and insurance setup before sending approval requests.');
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
        request_type: 'general_recommendation',
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
      await fetchData();
    } catch (err) {
      Alert.alert('Could not submit approval request', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleCancelApprovalRequest = async (request: ApprovalRequest) => {
    if (request.status !== 'pending') {
      Alert.alert('Request already finalized', 'Only pending homeowner approval requests can be cancelled.');
      return;
    }
    if (!assignment || assignment.status !== 'active' || !gcCanManage) {
      Alert.alert('Active complete GC management required', 'Only an active verified GC with complete setup can cancel a pending homeowner approval request.');
      return;
    }
    if (!assignment?.general_contractor_id) {
      Alert.alert('Request unavailable', 'Refresh the project and try again.');
      return;
    }

    Alert.alert(
      'Cancel approval request?',
      'This removes the pending homeowner decision. No project budget, schedule, trade, material, or completion change will be applied.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Cancel Request',
          style: 'destructive',
          onPress: async () => {
            setCancellingApprovalId(request.id);
            try {
              const { error } = await supabase
                .from('project_approval_requests')
                .update({ status: 'cancelled' })
                .eq('id', request.id)
                .eq('project_id', projectId)
                .eq('requested_by_gc_id', assignment.general_contractor_id)
                .eq('status', 'pending');

              if (error) {
                Alert.alert('Could not cancel request', formatAppSafeErrorMessage(error, 'Please try again.'));
                return;
              }
              await fetchData();
            } catch (err) {
              Alert.alert('Could not cancel request', formatAppSafeErrorMessage(err, 'Please try again.'));
            } finally {
              setCancellingApprovalId(null);
            }
          },
        },
      ],
    );
  };

  const startExternalTrade = (slot: Slot) => {
    setExternalSlotId(slot.id);
    setExternalTradeName(slot.external_trade_name ?? '');
    setExternalTradeCompany(slot.external_trade_company ?? '');
    setExternalTradeEmail(slot.external_trade_email ?? '');
    setExternalTradePhone(slot.external_trade_phone ?? '');
    setExternalTradeNotes(slot.external_trade_notes ?? '');
  };

  const handleSaveExternalTrade = async () => {
    if (!externalSlotId) return;
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC assignment required', 'The homeowner must confirm GC management before external trades can be managed.');
      return;
    }
    if (!gcCanManage) {
      Alert.alert('Complete verified GC setup required', 'WalkerAI must verify your GC profile and your business, license, and insurance setup must be complete before external trades can be managed.');
      return;
    }
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
      Alert.alert('Could not mark external trade', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSavingExternalTrade(false);
    }
  };

  const handleUploadExternalTradeDocument = async (slot: Slot) => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC assignment required', 'The homeowner must confirm GC management before trade documents can be uploaded.');
      return;
    }
    if (!gcCanManage) {
      Alert.alert('Complete verified GC setup required', 'WalkerAI must verify your GC profile and your business, license, and insurance setup must be complete before trade documents can be uploaded.');
      return;
    }
    if (slot.fulfillment_type !== 'external') {
      Alert.alert('External trade required', 'Documents can only be attached to externally managed trades.');
      return;
    }

    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
        assetRepresentationMode: 'compatible',
      });
      if (result.didCancel || !result.assets?.[0]) return;

      setUploadingExternalDocSlotId(slot.id);
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser?.id) throw new Error('Please sign in again before uploading trade documents.');

      const upload = getUploadMetadata(result.assets[0]);
      const path = `external-trades/${currentUser.id}/${projectId}/${slot.id}-${Date.now()}.${upload.extension}`;
      const { storagePath } = await uploadFile('company-docs', path, upload.uri, upload.contentType);
      const { error } = await supabase.rpc('add_external_trade_document', {
        p_slot_id: slot.id,
        p_document_url: storagePath,
      });
      if (error) throw error;
      await fetchData();
    } catch (err) {
      Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setUploadingExternalDocSlotId(null);
    }
  };

  const handleSubmitTermsUpdate = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC assignment required', 'The homeowner must confirm GC management before terms changes can be requested.');
      return;
    }
    if (!gcCanManage) {
      Alert.alert('Complete verified GC setup required', 'WalkerAI must verify your GC profile and your business, license, and insurance setup must be complete before terms changes can be requested.');
      return;
    }
    if (pendingTermsRequest) {
      Alert.alert('Terms request pending', 'Cancel or wait for the homeowner to respond to the existing terms update before submitting another one.');
      return;
    }

    const markupPct = parsePercent(proposedMarkupPct);
    if (markupPct == null || markupPct < 0 || markupPct > 50) {
      Alert.alert('Invalid management allowance', 'Management allowance must be between 0% and 50%.');
      return;
    }

    const conciergePct = parsePercent(proposedConciergeFeePct);
    if (conciergePct == null || conciergePct < 0 || conciergePct > 25) {
      Alert.alert('Invalid concierge allowance', 'Concierge allowance must be between 0% and 25%.');
      return;
    }

    if (markupPct === Number(assignment.markup_pct) && conciergePct === Number(assignment.concierge_fee_pct)) {
      Alert.alert('No change', 'Adjust the management terms before sending a homeowner approval request.');
      return;
    }

    setSubmittingTerms(true);
    try {
      const { error } = await supabase.from('project_approval_requests').insert({
        project_id: projectId,
        requested_by_gc_id: assignment.general_contractor_id,
        homeowner_id: assignment.homeowner_id,
        request_type: 'general_recommendation',
        title: 'GC management terms update',
        description: [
          'A GC management terms update is ready for homeowner review.',
          'No terms change applies until the homeowner approves this request.',
        ].join('\n'),
        cost_delta: null,
        timeline_delta_days: null,
        metadata: {
          action: 'update_gc_terms',
          current_markup_pct: Number(assignment.markup_pct),
          proposed_markup_pct: markupPct,
          current_concierge_fee_pct: Number(assignment.concierge_fee_pct),
          proposed_concierge_fee_pct: conciergePct,
        },
      });
      if (error) throw error;
      Alert.alert('Sent for approval', 'The homeowner must approve before WalkerAI updates the GC management terms.');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not request terms update', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmittingTerms(false);
    }
  };

  const handleSubmitBudgetUpdate = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC assignment required', 'The homeowner must confirm GC management before budget changes can be requested.');
      return;
    }
    if (!gcCanManage) {
      Alert.alert('Complete verified GC setup required', 'WalkerAI must verify your GC profile and your business, license, and insurance setup must be complete before budget changes can be requested.');
      return;
    }
    if (pendingBudgetRequest) {
      Alert.alert('Budget request pending', 'Cancel or wait for the homeowner to respond to the existing budget update before submitting another one.');
      return;
    }

    const budgetMin = parseNonNegativeCadToCents(proposedBudgetMin);
    const budgetMax = parseNonNegativeCadToCents(proposedBudgetMax);
    if (budgetMin == null || budgetMin <= 0 || budgetMax == null || budgetMax <= 0 || budgetMax < budgetMin) {
      Alert.alert('Invalid budget range', 'Enter a positive low and high estimate, with the high estimate greater than or equal to the low estimate.');
      return;
    }

    setSubmittingBudget(true);
    try {
      const { error } = await supabase.from('project_approval_requests').insert({
        project_id: projectId,
        requested_by_gc_id: assignment.general_contractor_id,
        homeowner_id: assignment.homeowner_id,
        request_type: 'general_recommendation',
        title: 'Preliminary project budget',
        description: [
          `Proposed budget range: ${formatCad(budgetMin)} - ${formatCad(budgetMax)}`,
          'This becomes the project budget basis for trade-slot generation and dispatch only after homeowner approval.',
        ].join('\n'),
        cost_delta: project?.ai_cost_min != null && project.ai_cost_max != null
          ? budgetMax - project.ai_cost_max
          : null,
        timeline_delta_days: null,
        metadata: {
          action: 'update_gc_budget',
          current_ai_cost_min: project?.ai_cost_min ?? null,
          current_ai_cost_max: project?.ai_cost_max ?? null,
          proposed_ai_cost_min: budgetMin,
          proposed_ai_cost_max: budgetMax,
        },
      });
      if (error) throw error;
      Alert.alert('Sent for approval', 'The homeowner must approve before WalkerAI updates the project budget basis.');
      setProposedBudgetMin('');
      setProposedBudgetMax('');
      await fetchData();
    } catch (err) {
      Alert.alert('Could not request budget update', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmittingBudget(false);
    }
  };

  const estimate = project?.ai_cost_min != null && project.ai_cost_max != null
    ? `${formatCad(project.ai_cost_min)} - ${formatCad(project.ai_cost_max)}`
    : project?.ai_cost_max != null || project?.ai_cost_min != null
    ? formatCad(project.ai_cost_max ?? project.ai_cost_min ?? 0)
    : 'Pending';
  const assignedTrades = slots.filter((slot) => slot.fulfillment_type === 'external' || !!getCompanyName(slot)).length;
  const assignmentIsActive = assignment?.status === 'active' && gcCanManage;
  const assignmentIsCompleted = assignment?.status === 'completed';
  const headerStatus = assignment?.status ?? project?.status ?? null;
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
              <Text style={styles.title}>{formatGcProjectType(assignment?.project_type, project?.room_type)}</Text>
              <Text style={styles.subtitle}>{project?.city || project?.address || 'Managed project'}</Text>
            </View>
            {headerStatus ? (
              <StatusBadge
                label={formatStatusLabel(headerStatus)}
                variant={assignment ? assignmentStatusVariant(headerStatus) : projectStatusVariant(headerStatus)}
                dot
              />
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
                        Management is active only within the homeowner-approved project terms.
                      </Text>
                    </View>
                    <StatusBadge
                      label={formatStatusLabel(assignment.status)}
                      variant={assignmentStatusVariant(assignment.status)}
                      dot
                    />
                  </View>
                  {assignment.homeowner_contact_name || assignment.homeowner_contact_email || assignment.homeowner_contact_phone ? (
                    <View style={styles.contactPanel}>
                      <Text style={styles.contactLabel}>Homeowner contact</Text>
                      {assignment.homeowner_contact_name ? <Text style={styles.contactText}>{assignment.homeowner_contact_name}</Text> : null}
                      {assignment.homeowner_contact_email ? <Text style={styles.contactText}>{assignment.homeowner_contact_email}</Text> : null}
                      {assignment.homeowner_contact_phone ? <Text style={styles.contactText}>{assignment.homeowner_contact_phone}</Text> : null}
                    </View>
                  ) : null}
                  {assignment.scope_summary ? <Text style={styles.scopeText}>{assignment.scope_summary}</Text> : null}
                  {assignment.status === 'invited' && !assignment.initiated_by_gc && gcCanManage ? (
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
                  ) : assignment.status === 'invited' && !gcVerified ? (
                    <Text style={styles.pendingHomeownerText}>
                      WalkerAI verification is required before you can accept this management invite.
                    </Text>
                  ) : assignment.status === 'invited' && !gcProfileComplete ? (
                    <Text style={styles.pendingHomeownerText}>
                      Complete your GC business profile, license, and insurance setup before you can accept this management invite.
                    </Text>
                  ) : assignment.status === 'active' && !gcCanManage ? (
                    <Text style={styles.pendingHomeownerText}>
                      Complete verified GC setup is required before project controls are available.
                    </Text>
                  ) : null}
                </GlassCard>
              ) : null}

              {assignmentIsActive ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Project controls</Text>
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorSchedule', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="calendar-clock" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Schedule center</Text>
                      <Text style={styles.controlSub}>Recommend trade dates for homeowner approval</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorPermits', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="file-check-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Permits & inspections</Text>
                      <Text style={styles.controlSub}>Track documents and inspection status</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorPayments', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="cash" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Payment requests</Text>
                      <Text style={styles.controlSub}>Ask for deposit, progress, or final draw approval</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorMaterials', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="cube-send" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Material sourcing</Text>
                      <Text style={styles.controlSub}>Recommend substitutions and supplier quote details</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorTrades', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="account-hard-hat" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Trade management</Text>
                      <Text style={styles.controlSub}>Compare assigned trades, quotes, and replacement recommendations</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorDiscovery', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="alert-decagram-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Discovery & changes</Text>
                      <Text style={styles.controlSub}>Send hidden issues and scope changes for approval</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorAssistant', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="robot-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Project assistant</Text>
                      <Text style={styles.controlSub}>Generate daily summary, risk alerts, and outstanding tasks</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorMessages', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="message-text-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Project messages</Text>
                      <Text style={styles.controlSub}>Coordinate with the homeowner and project participants</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorCompletion', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="folder-check-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Completion binder</Text>
                      <Text style={styles.controlSub}>Review permits, warranties, receipts, and approvals</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                </GlassCard>
              ) : assignmentIsCompleted ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Project history</Text>
                  <Text style={styles.bodyText}>
                    Completed project records are available read-only. Review schedule, permits, payments, materials, trades, discoveries, messages, assistant summaries, and the closeout binder without changing scope, schedule, spending, or payments.
                  </Text>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorSchedule', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="calendar-clock" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Schedule center</Text>
                      <Text style={styles.controlSub}>Review final trade dates and schedule recommendations</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorPermits', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="file-check-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Permits & inspections</Text>
                      <Text style={styles.controlSub}>Review final permit and inspection records</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorPayments', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="cash" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Payment requests</Text>
                      <Text style={styles.controlSub}>Review deposit, progress, and final draw requests</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorMaterials', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="cube-send" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Material sourcing</Text>
                      <Text style={styles.controlSub}>Review material orders and substitution requests</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorTrades', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="account-hard-hat" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Trade management</Text>
                      <Text style={styles.controlSub}>Review assigned trades, external trades, quotes, and negotiations</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorDiscovery', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="alert-decagram-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Discovery & changes</Text>
                      <Text style={styles.controlSub}>Review discoveries, scope changes, and homeowner decisions</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorAssistant', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="robot-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Project assistant</Text>
                      <Text style={styles.controlSub}>Summarize final records, risks, and remaining homeowner decisions</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorMessages', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="message-text-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Project messages</Text>
                      <Text style={styles.controlSub}>Review the completed project communication history</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorCompletion', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="folder-check-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Completion binder</Text>
                      <Text style={styles.controlSub}>Review warranties, receipts, approvals, and closeout records</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                </GlassCard>
              ) : assignment ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Project controls</Text>
                  <View style={styles.lockedControlsPanel}>
                    <View style={styles.lockedControlsIcon}>
                      <Icon name="lock-clock" size={22} color={Colors.warning} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.lockedControlsTitle}>Controls unlock after homeowner confirmation</Text>
                      <Text style={styles.controlSub}>
                        Schedule, permit, payment, material, trade, discovery, assistant, and completion tools become available once GC management is active.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.controlDivider} />
                  <TouchableOpacity
                    style={styles.controlRow}
                    onPress={() => navigation.navigate('GeneralContractorMessages', { id: projectId })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.controlIcon}>
                      <Icon name="message-text-outline" size={20} color={Colors.accent} />
                    </View>
                    <View style={styles.controlBody}>
                      <Text style={styles.controlTitle}>Project messages</Text>
                      <Text style={styles.controlSub}>Coordinate with the homeowner while management approval is pending</Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                  </TouchableOpacity>
                </GlassCard>
              ) : null}

              {assignment ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Budget planning</Text>
                  {markupSummary ? (
                    <>
                      <BudgetRow
                        label="AI budget basis"
                        value={`${formatCad(markupSummary.baseMinCents)} - ${formatCad(markupSummary.baseMaxCents)}`}
                      />
                      <BudgetRow
                        label="Project total"
                        value={`${formatCad(markupSummary.homeownerTotalMinCents)} - ${formatCad(markupSummary.homeownerTotalMaxCents)}`}
                        strong
                      />
                    </>
                  ) : (
                    <Text style={styles.bodyText}>
                      Generate or enter an estimate before WalkerAI can calculate the homeowner-facing total.
                    </Text>
                  )}
                  {assignmentIsActive ? (
                    <View style={styles.termsEditor}>
                      <Text style={styles.sectionSubTitle}>Budget basis</Text>
                      <Text style={styles.bodyText}>
                        Propose the preliminary estimate range used for trade-slot generation and dispatch. The homeowner must approve before it applies.
                      </Text>
                      <View style={styles.formRow}>
                        <GlassInput
                          label="Low estimate CAD"
                          value={proposedBudgetMin}
                          onChangeText={setProposedBudgetMin}
                          keyboardType="decimal-pad"
                          containerStyle={styles.formHalf}
                        />
                        <GlassInput
                          label="High estimate CAD"
                          value={proposedBudgetMax}
                          onChangeText={setProposedBudgetMax}
                          keyboardType="decimal-pad"
                          containerStyle={styles.formHalf}
                        />
                      </View>
                      <GlassButton
                        label="Send Budget for Approval"
                        onPress={handleSubmitBudgetUpdate}
                        loading={submittingBudget}
                        disabled={submittingBudget || !!pendingBudgetRequest}
                        fullWidth
                        size="sm"
                        style={styles.submitApprovalButton}
                      />
                      {pendingBudgetRequest ? (
                        <Text style={styles.approvalHint}>
                          A budget request is already waiting for homeowner response. Cancel it or wait for a decision before sending another budget update.
                        </Text>
                      ) : null}
                      <View style={styles.controlDivider} />
                      <Text style={styles.sectionSubTitle}>Project terms</Text>
                      <Text style={styles.bodyText}>
                        Update project management settings through homeowner approval. Approved settings recalculate this project only.
                      </Text>
                      <View style={styles.formRow}>
                        <GlassInput
                          label="Management allowance"
                          value={proposedMarkupPct}
                          onChangeText={setProposedMarkupPct}
                          keyboardType="decimal-pad"
                          containerStyle={styles.formHalf}
                        />
                        <GlassInput
                          label="Concierge allowance"
                          value={proposedConciergeFeePct}
                          onChangeText={setProposedConciergeFeePct}
                          keyboardType="decimal-pad"
                          containerStyle={styles.formHalf}
                        />
                      </View>
                      <GlassButton
                        label="Send Terms for Approval"
                        onPress={handleSubmitTermsUpdate}
                        loading={submittingTerms}
                        disabled={submittingTerms || !!pendingTermsRequest}
                        fullWidth
                        size="sm"
                        style={styles.submitApprovalButton}
                      />
                      {pendingTermsRequest ? (
                        <Text style={styles.approvalHint}>
                          A terms request is already waiting for homeowner response. Cancel it or wait for a decision before sending another terms update.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </GlassCard>
              ) : null}

              {assignmentIsActive ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Request homeowner approval</Text>
                  <Text style={styles.bodyText}>
                    Use this only for general recommendations that do not need schedule, trade, material, discovery, payment, or completion metadata.
                  </Text>
                  <Text style={styles.approvalHint}>
                    Use the dedicated project-control screens for workflow changes so homeowner approval has the required data to apply cleanly. Payment authorizations belong in Payment requests so escrow and milestone workflows stay separate.
                  </Text>
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
                      {request.response_note ? (
                        <Text style={styles.responseNote}>Homeowner note: {request.response_note}</Text>
                      ) : null}
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
                        name={slot.fulfillment_type === 'external' ? 'account-hard-hat' : getCompanyName(slot) ? 'check-circle-outline' : 'circle-outline'}
                        size={18}
                        color={slot.fulfillment_type === 'external' ? Colors.warning : getCompanyName(slot) ? Colors.success : Colors.text.tertiary}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{formatTrade(slot.trade_type)}</Text>
                      <Text style={styles.rowSub}>
                        {slot.fulfillment_type === 'external'
                          ? `${getSlotParticipantName(slot)} · Externally managed`
                          : getSlotParticipantName(slot) ?? formatStatusLabel(slot.status)}
                      </Text>
                      {slot.fulfillment_type === 'external' ? (
                        <Text style={styles.externalWarning}>
                          Not verified by WalkerAI · No escrow protection · GC managed
                        </Text>
                      ) : null}
                      {slot.fulfillment_type === 'external' ? (
                        <View style={styles.externalDocumentRow}>
                          <Text style={styles.externalDocumentText}>
                            {(slot.external_trade_document_urls?.length ?? 0) > 0
                              ? `${slot.external_trade_document_urls?.length ?? 0} document${(slot.external_trade_document_urls?.length ?? 0) === 1 ? '' : 's'} uploaded`
                              : 'No license or insurance documents uploaded'}
                          </Text>
                          {assignmentIsActive ? (
                            <TouchableOpacity
                              style={styles.externalDocButton}
                              onPress={() => handleUploadExternalTradeDocument(slot)}
                              disabled={uploadingExternalDocSlotId === slot.id}
                              activeOpacity={0.85}
                            >
                              <Text style={styles.externalLinkText}>
                                {uploadingExternalDocSlotId === slot.id ? 'Uploading...' : 'Upload docs'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      {assignmentIsActive && !getCompanyName(slot) && slot.fulfillment_type !== 'external' ? (
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

              {assignmentIsActive && externalSlotId ? (
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
                {pendingDecisionApprovalRequests.length === 0 && pendingDecisionChangeOrders.length === 0 ? (
                  <Text style={styles.bodyText}>No change orders or approval requests are pending.</Text>
                ) : (
                  <>
                    {pendingDecisionApprovalRequests.map((request) => (
                      <View key={`approval-${request.id}`} style={styles.row}>
                        <View style={styles.rowIcon}>
                          <Icon name="clock-alert-outline" size={18} color={Colors.warning} />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>{request.title}</Text>
                          <Text style={styles.rowSub}>
                            {formatStatusLabel(request.request_type)}
                            {request.cost_delta != null ? ` · ${formatSignedCadCents(request.cost_delta)}` : ''}
                            {request.timeline_delta_days != null ? ` · ${request.timeline_delta_days > 0 ? '+' : ''}${request.timeline_delta_days} days` : ''}
                          </Text>
                          {!assignmentIsActive ? (
                            <Text style={styles.approvalHint}>
                              Active complete verified GC management is required before this pending recommendation can be cancelled.
                            </Text>
                          ) : null}
                          <GlassButton
                            label="Cancel Request"
                            onPress={() => handleCancelApprovalRequest(request)}
                            loading={cancellingApprovalId === request.id}
                            disabled={!assignmentIsActive || !!cancellingApprovalId}
                            variant="secondary"
                            size="sm"
                            style={styles.cancelRequestButton}
                          />
                        </View>
                      </View>
                    ))}
                    {pendingDecisionChangeOrders.map((order) => (
                      <View key={`change-order-${order.id}`} style={styles.row}>
                        <View style={styles.rowIcon}>
                          <Icon name="clock-outline" size={18} color={Colors.warning} />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>{order.description}</Text>
                          <Text style={styles.rowSub}>
                            {formatStatusLabel(order.status)}
                            {order.cost_delta != null ? ` · ${formatSignedCadCents(order.cost_delta)}` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
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
  sectionSubTitle: { ...Typography.caption, color: Colors.text.primary, fontWeight: '800', marginBottom: 8 },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  termsEditor: { marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.glass.border, paddingTop: Spacing.sm },
  assignmentHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  contactPanel: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  contactLabel: { ...Typography.caption, color: Colors.text.tertiary, marginBottom: 4 },
  contactText: { ...Typography.bodySecondary, color: Colors.text.primary, marginTop: 2 },
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
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  controlIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBody: { flex: 1 },
  controlTitle: { ...Typography.body, fontWeight: '800' },
  controlSub: { ...Typography.caption, marginTop: 3 },
  controlDivider: { height: 1, backgroundColor: Colors.glass.border, marginVertical: 12 },
  lockedControlsPanel: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  lockedControlsIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,193,7,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedControlsTitle: { ...Typography.body, color: Colors.text.primary, fontWeight: '800' },
  approvalHint: { ...Typography.caption, color: Colors.warning, lineHeight: 18, marginTop: 8 },
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
  responseNote: { ...Typography.caption, color: Colors.text.primary, marginTop: 6, lineHeight: 18 },
  cancelRequestButton: { marginTop: 9, alignSelf: 'flex-start' },
  externalWarning: { ...Typography.caption, color: Colors.warning, marginTop: 5, lineHeight: 17 },
  externalDocumentRow: { marginTop: 8 },
  externalDocumentText: { ...Typography.caption, color: Colors.text.secondary, marginBottom: 6 },
  externalDocButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  externalLink: { alignSelf: 'flex-start', marginTop: 9 },
  externalLinkText: { color: Colors.accent, fontSize: 13, fontWeight: '800' },
  externalActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  externalActionButton: { flex: 1 },
});
