import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
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
import { formatCadCents, formatSignedCadCents } from '@/lib/currency';
import { formatStatusLabel } from '@/lib/formatters';
import { formatGcProjectType } from '@/lib/gc-project-type';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';
import type { ChangeOrder } from '@/types/database.types';

interface ProjectSummary {
  id: string;
  status: string;
  address: string | null;
  room_type: string | null;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
}

interface PermitRecord {
  id: string;
  permit_type: string;
  status: string;
}

interface WarrantyRecord {
  id: string;
  expiry_date: string | null;
}

interface MaterialOrderRecord {
  id: string;
  status: string;
  final_price: number | null;
}

interface ProjectSlotRecord {
  id: string;
  status: string;
  scheduled_start_date: string | null;
}

interface TradeNegotiationRecord {
  id: string;
  status: string;
}

interface MilestoneRecord {
  id: string;
  status: string;
}

interface QuoteRecord {
  id: string;
  status: string;
  milestones?: MilestoneRecord[];
}

interface ApprovalRecord {
  id: string;
  request_type: string;
  title: string;
  status: string;
  cost_delta: number | null;
  metadata: Record<string, unknown>;
}

interface PaymentRequestRecord {
  id: string;
  request_kind: string;
  title: string;
  status: string;
  amount_cents: number;
}

interface AssignmentRecord {
  id: string;
  status: string;
  homeowner_id: string;
  general_contractor_id: string;
  project_type: string | null;
}

function statusVariant(status: string): 'pending' | 'completed' | 'error' | 'neutral' {
  if (status === 'approved' || status === 'passed' || status === 'paid' || status === 'confirmed') return 'completed';
  if (status === 'rejected' || status === 'cancelled') return 'error';
  if (status === 'pending' || status === 'delivered') return 'pending';
  return 'neutral';
}

export default function GeneralContractorCompletionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [assignment, setAssignment] = useState<AssignmentRecord | null>(null);
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
  const [materialOrders, setMaterialOrders] = useState<MaterialOrderRecord[]>([]);
  const [projectSlots, setProjectSlots] = useState<ProjectSlotRecord[]>([]);
  const [tradeNegotiations, setTradeNegotiations] = useState<TradeNegotiationRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestRecord[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingCompletion, setSubmittingCompletion] = useState(false);
  const [gcVerified, setGcVerified] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser?.id) {
        throw new Error('You need to be signed in to view the completion binder.');
      }
      const { data: gc, error: gcError } = await supabase
        .from('general_contractors')
        .select('id, verified')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');
      setGcVerified(gc.verified === true);

      const [
        projectResult,
        permitResult,
        warrantyResult,
        materialResult,
        slotResult,
        tradeNegotiationResult,
        quoteResult,
        approvalResult,
        paymentResult,
        changeOrderResult,
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('id, status, address, room_type, ai_cost_min, ai_cost_max')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('permits')
          .select('id, permit_type, status')
          .eq('project_id', projectId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('warranties')
          .select('id, expiry_date')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('material_orders')
          .select('id, status, final_price')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_slots')
          .select('id, status, scheduled_start_date')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase
          .from('gc_trade_quote_negotiations')
          .select('id, status')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('quotes')
          .select('id, status, milestones(id, status)')
          .eq('project_id', projectId)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('project_approval_requests')
          .select('id, request_type, title, status, cost_delta, metadata')
          .eq('project_id', projectId)
          .eq('requested_by_gc_id', gc.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('gc_payment_requests')
          .select('id, request_kind, title, status, amount_cents')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('change_orders')
          .select('id, project_id, company_id, description, cost_delta, status, signed_by_homeowner, signed_by_company, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      const loadError = projectResult.error
        ?? permitResult.error
        ?? warrantyResult.error
        ?? materialResult.error
        ?? slotResult.error
        ?? tradeNegotiationResult.error
        ?? quoteResult.error
        ?? approvalResult.error
        ?? paymentResult.error
        ?? changeOrderResult.error;
      if (loadError) throw loadError;

      setProject(projectResult.data as ProjectSummary | null);
      setPermits((permitResult.data ?? []) as PermitRecord[]);
      setWarranties((warrantyResult.data ?? []) as WarrantyRecord[]);
      setMaterialOrders((materialResult.data ?? []) as MaterialOrderRecord[]);
      setProjectSlots((slotResult.data ?? []) as ProjectSlotRecord[]);
      setTradeNegotiations((tradeNegotiationResult.data ?? []) as TradeNegotiationRecord[]);
      setQuotes((quoteResult.data ?? []) as QuoteRecord[]);
      setApprovals((approvalResult.data ?? []) as ApprovalRecord[]);
      setPaymentRequests((paymentResult.data ?? []) as PaymentRequestRecord[]);
      setChangeOrders((changeOrderResult.data ?? []) as ChangeOrder[]);

      const { data: assignmentRow, error: assignmentError } = await supabase
        .from('general_contractor_projects')
        .select('id, status, homeowner_id, general_contractor_id, project_type')
        .eq('project_id', projectId)
        .eq('general_contractor_id', gc.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;
      setAssignment(assignmentRow as AssignmentRecord | null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load completion binder.');
      setProject(null);
      setAssignment(null);
      setPermits([]);
      setWarranties([]);
      setMaterialOrders([]);
      setProjectSlots([]);
      setTradeNegotiations([]);
      setQuotes([]);
      setApprovals([]);
      setPaymentRequests([]);
      setChangeOrders([]);
      setGcVerified(false);
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

  const passedPermits = permits.filter((permit) => permit.status === 'passed').length;
  const openPermits = permits.filter((permit) => permit.status !== 'passed');
  const completedMaterialOrders = materialOrders.filter((order) => ['confirmed', 'paid'].includes(order.status));
  const activeMaterialOrders = materialOrders.filter((order) => !['confirmed', 'paid', 'cancelled'].includes(order.status));
  const unresolvedTradeSlots = projectSlots.filter((slot) => !['filled', 'scheduled'].includes(slot.status));
  const unscheduledTradeSlots = projectSlots.filter((slot) => ['filled', 'scheduled'].includes(slot.status) && !slot.scheduled_start_date);
  const completedMaterials = completedMaterialOrders.length;
  const pendingTradeNegotiations = tradeNegotiations.filter((negotiation) => negotiation.status === 'pending').length;
  const pendingQuotes = quotes.filter((quote) => quote.status === 'pending').length;
  const unresolvedMilestones = quotes
    .filter((quote) => quote.status === 'approved')
    .flatMap((quote) => quote.milestones ?? [])
    .filter((milestone) => milestone.status !== 'paid').length;
  const pendingChangeOrders = changeOrders.filter((order) => (
    order.status === 'proposed' && order.signed_by_company && !order.signed_by_homeowner
  )).length;
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length
    + paymentRequests.filter((request) => request.status === 'pending').length
    + pendingChangeOrders;
  const paidMaterials = completedMaterialOrders.reduce((sum, order) => sum + (order.final_price ?? 0), 0);
  const completionRequests = approvals.filter((approval) => approval.metadata?.action === 'complete_project');
  const latestCompletionRequest = completionRequests[0];
  const pendingCompletionRequest = completionRequests.find((approval) => approval.status === 'pending');
  const projectReadyForCloseout = project?.status === 'active';
  const projectIsCompleted = project?.status === 'completed' || assignment?.status === 'completed';
  const budgetReadyForCloseout = (project?.ai_cost_min ?? 0) > 0 && (project?.ai_cost_max ?? 0) > 0;
  const activeCloseoutBlockers = (projectReadyForCloseout ? 0 : 1)
    + (budgetReadyForCloseout ? 0 : 1)
    + unresolvedTradeSlots.length
    + unscheduledTradeSlots.length
    + openPermits.length
    + activeMaterialOrders.length
    + pendingTradeNegotiations
    + pendingQuotes
    + unresolvedMilestones;
  const closeoutBlockers = projectIsCompleted ? 0 : activeCloseoutBlockers;
  const canRequestCompletion = assignment?.status === 'active'
    && gcVerified
    && projectReadyForCloseout
    && budgetReadyForCloseout
    && !pendingCompletionRequest
    && pendingApprovals === 0
    && closeoutBlockers === 0;

  const handleRequestCompletion = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm active GC management before completion can be requested.');
      return;
    }
    if (!gcVerified) {
      Alert.alert('Verification required', 'WalkerAI must verify your GC profile before completion can be requested.');
      return;
    }
    if (pendingApprovals > 0) {
      Alert.alert('Pending approvals remain', 'Resolve existing approvals, payment requests, and change orders before requesting final project completion.');
      return;
    }
    if (!projectReadyForCloseout || !budgetReadyForCloseout) {
      Alert.alert('Project not ready for closeout', 'The project must be active with an approved budget before final completion can be requested.');
      return;
    }
    if (closeoutBlockers > 0) {
      Alert.alert('Closeout items remain', 'Resolve project readiness, open trade slots, unscheduled trades, active permits, material orders, trade negotiations, pending quotes, and unpaid milestones before requesting final project completion.');
      return;
    }

    Alert.alert(
      'Request project completion?',
      'The homeowner must approve this before WalkerAI marks the project and GC assignment completed. This does not release escrow funds.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request',
          onPress: async () => {
            setSubmittingCompletion(true);
            const { error } = await supabase.from('project_approval_requests').insert({
              project_id: projectId,
              requested_by_gc_id: assignment.general_contractor_id,
              homeowner_id: assignment.homeowner_id,
              request_type: 'general_recommendation',
              title: 'Project completion approval',
              description: 'GC recommends marking the renovation complete. Escrow and milestone releases still follow their existing payment workflows.',
              metadata: { action: 'complete_project' },
            });
            if (error) {
              Alert.alert('Could not request completion', error.message);
            } else {
              await fetchData();
            }
            setSubmittingCompletion(false);
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
              <Text style={styles.title}>Digital project binder</Text>
              <Text style={styles.subtitle}>Closeout records assembled from WalkerAI project data.</Text>
            </View>
          </View>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Binder unavailable</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading completion binder...</Text>
            </GlassCard>
          ) : (
            <>
              <GlassCard style={styles.card}>
                <Text style={styles.binderTitle}>
                  {project ? formatGcProjectType(assignment?.project_type, project.room_type) : 'Project'}
                </Text>
                <Text style={styles.bodyText}>{project?.address ?? 'Address pending'}</Text>
                <View style={styles.summaryGrid}>
                  <SummaryTile label="Status" value={project ? formatStatusLabel(project.status) : 'Unknown'} />
                  <SummaryTile label="Permits passed" value={`${passedPermits}/${permits.length}`} />
                  <SummaryTile label="Materials complete" value={`${completedMaterials}/${materialOrders.length}`} />
                  <SummaryTile label="Warranties" value={warranties.length} />
                  <SummaryTile label="Pending approvals" value={pendingApprovals} warning={pendingApprovals > 0} />
                  <SummaryTile label="Closeout blockers" value={closeoutBlockers} warning={closeoutBlockers > 0} />
                </View>
                {latestCompletionRequest ? (
                  <View style={styles.completionStatus}>
                    <Text style={styles.bodyText}>Latest completion request: {formatStatusLabel(latestCompletionRequest.status)}</Text>
                  </View>
                ) : null}
                {canRequestCompletion ? (
                  <GlassButton
                    label="Request Homeowner Completion Approval"
                    onPress={handleRequestCompletion}
                    loading={submittingCompletion}
                    fullWidth
                    size="sm"
                    style={styles.completionButton}
                  />
                ) : project?.status !== 'completed' && assignment?.status === 'active' && !gcVerified ? (
                  <Text style={styles.completionNote}>
                    WalkerAI verification is required before final project completion can be requested.
                  </Text>
                ) : project?.status !== 'completed' && !pendingCompletionRequest ? (
                  <Text style={styles.completionNote}>
                    Resolve project readiness, pending approvals, payment requests, change orders, open trade slots, unscheduled trades, permits, material orders, trade negotiations, pending quotes, and unpaid milestones before requesting final project completion.
                  </Text>
                ) : null}
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Financial closeout</Text>
                <InfoRow label="AI estimate" value={project?.ai_cost_min && project?.ai_cost_max ? `${formatCadCents(project.ai_cost_min)} - ${formatCadCents(project.ai_cost_max)}` : 'TBD'} />
                <InfoRow label="Material receipts" value={formatCadCents(paidMaterials)} />
                <InfoRow label="Change orders" value={`${pendingChangeOrders} pending homeowner decision`} />
                <InfoRow label="Open trade slots" value={`${unresolvedTradeSlots.length} remaining`} />
                <InfoRow label="Unscheduled trades" value={`${unscheduledTradeSlots.length} remaining`} />
                <InfoRow label="GC payment requests" value={`${paymentRequests.filter((request) => request.status === 'approved').length}/${paymentRequests.length} approved`} />
                <InfoRow label="Pending trade pricing" value={`${pendingTradeNegotiations + pendingQuotes} open`} />
                <InfoRow label="Unpaid milestones" value={`${unresolvedMilestones} remaining`} />
              </GlassCard>

              <BinderSection title="Permits & inspections" emptyText="No permit or inspection records yet.">
                {permits.map((permit) => (
                  <RecordRow key={permit.id} title={permit.permit_type} meta={formatStatusLabel(permit.status)} status={permit.status} />
                ))}
              </BinderSection>

              <BinderSection title="Warranty package" emptyText="No warranty documents uploaded yet.">
                {warranties.map((warranty) => (
                  <RecordRow
                    key={warranty.id}
                    title="Warranty document"
                    meta={warranty.expiry_date ? `Expires ${new Date(warranty.expiry_date).toLocaleDateString('en-CA')}` : 'No expiry provided'}
                    status="approved"
                  />
                ))}
              </BinderSection>

              <BinderSection title="Material receipts" emptyText="No completed material orders yet.">
                {completedMaterialOrders.map((order) => (
                  <RecordRow
                    key={order.id}
                    title={order.final_price != null ? formatCadCents(order.final_price) : 'Material order'}
                    meta={formatStatusLabel(order.status)}
                    status={order.status}
                  />
                ))}
              </BinderSection>

              <BinderSection title="Approvals & changes" emptyText="No approval records yet.">
                {approvals.slice(0, 8).map((approval) => (
                  <RecordRow
                    key={approval.id}
                    title={approval.title}
                    meta={`${formatStatusLabel(approval.request_type)}${approval.cost_delta != null ? ` · ${formatSignedCadCents(approval.cost_delta)}` : ''}`}
                    status={approval.status}
                  />
                ))}
              </BinderSection>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function SummaryTile({ label, value, warning = false }: { label: string; value: string | number; warning?: boolean }) {
  return (
    <View style={[styles.summaryTile, warning && styles.summaryTileWarning]}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function BinderSection({ title, emptyText, children }: { title: string; emptyText: string; children: ReactNode }) {
  const childCount = Array.isArray(children) ? children.length : children ? 1 : 0;
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {childCount > 0 ? children : <Text style={styles.bodyText}>{emptyText}</Text>}
    </GlassCard>
  );
}

function RecordRow({ title, meta, status }: { title: string; meta: string; status: string }) {
  return (
    <View style={styles.recordRow}>
      <View style={styles.recordBody}>
        <Text style={styles.recordTitle}>{title}</Text>
        <Text style={styles.recordMeta}>{meta}</Text>
      </View>
      <StatusBadge label={formatStatusLabel(status)} variant={statusVariant(status)} size="sm" />
    </View>
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
  binderTitle: { ...Typography.h3, marginBottom: 4 },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.sm },
  summaryTile: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    padding: 12,
  },
  summaryTileWarning: { borderColor: 'rgba(245,158,11,0.55)' },
  summaryValue: { color: Colors.text.primary, fontSize: 18, fontWeight: '900' },
  summaryLabel: { ...Typography.caption, marginTop: 3 },
  completionButton: { marginTop: Spacing.sm },
  completionStatus: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  completionNote: { ...Typography.caption, color: Colors.warning, marginTop: Spacing.sm, lineHeight: 18 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  infoLabel: { ...Typography.bodySecondary, flex: 1 },
  infoValue: { ...Typography.body, fontWeight: '800', textAlign: 'right', flex: 1 },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  recordBody: { flex: 1 },
  recordTitle: { ...Typography.body, fontWeight: '800' },
  recordMeta: { ...Typography.caption, marginTop: 3 },
});
