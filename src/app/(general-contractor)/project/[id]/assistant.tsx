import { useCallback, useMemo, useState } from 'react';
import {
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
import { GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

interface ProjectRow {
  id: string;
  status: string;
  room_type: string | null;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
}

interface SlotRow {
  id: string;
  trade_type: string;
  status: string;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  scheduled_start_date: string | null;
  scheduled_end_date: string | null;
}

interface PermitRow {
  id: string;
  permit_type: string;
  status: string;
}

interface ApprovalRow {
  id: string;
  request_type: string;
  title: string;
  status: string;
  cost_delta: number | null;
  timeline_delta_days: number | null;
}

interface PaymentRequestRow {
  id: string;
  request_kind: string;
  title: string;
  amount_cents: number;
  status: string;
}

interface MaterialOrderRow {
  id: string;
  status: string;
  delivery_deadline: string | null;
}

interface MessageRow {
  id: string;
  sent_at: string;
}

interface AssignmentRow {
  project_type: string | null;
}

function formatTrade(tradeType: string) {
  return tradeType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function GeneralContractorAssistantScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestRow[]>([]);
  const [materialOrders, setMaterialOrders] = useState<MaterialOrderRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const [projectResult, assignmentResult, slotResult, permitResult, approvalResult, paymentResult, materialResult, messageResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, status, room_type, ai_cost_min, ai_cost_max')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('general_contractor_projects')
          .select('project_type')
          .eq('project_id', projectId)
          .neq('status', 'removed')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('project_slots')
          .select('id, trade_type, status, fulfillment_type, scheduled_start_date, scheduled_end_date')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase
          .from('permits')
          .select('id, permit_type, status')
          .eq('project_id', projectId),
        supabase
          .from('project_approval_requests')
          .select('id, request_type, title, status, cost_delta, timeline_delta_days')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('gc_payment_requests')
          .select('id, request_kind, title, amount_cents, status')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('material_orders')
          .select('id, status, delivery_deadline')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('messages')
          .select('id, sent_at')
          .eq('project_id', projectId)
          .order('sent_at', { ascending: false })
          .limit(20),
      ]);

      const loadError = projectResult.error
        ?? assignmentResult.error
        ?? slotResult.error
        ?? permitResult.error
        ?? approvalResult.error
        ?? paymentResult.error
        ?? materialResult.error
        ?? messageResult.error;
      if (loadError) throw loadError;

      setProject(projectResult.data as ProjectRow | null);
      setAssignment(assignmentResult.data as AssignmentRow | null);
      setSlots((slotResult.data ?? []) as SlotRow[]);
      setPermits((permitResult.data ?? []) as PermitRow[]);
      setApprovals((approvalResult.data ?? []) as ApprovalRow[]);
      setPaymentRequests((paymentResult.data ?? []) as PaymentRequestRow[]);
      setMaterialOrders((materialResult.data ?? []) as MaterialOrderRow[]);
      setMessages((messageResult.data ?? []) as MessageRow[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not generate project assistant summary.');
      setProject(null);
      setAssignment(null);
      setSlots([]);
      setPermits([]);
      setApprovals([]);
      setPaymentRequests([]);
      setMaterialOrders([]);
      setMessages([]);
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

  const assistant = useMemo(() => {
    const today = todayIso();
    const pendingApprovals = approvals.filter((item) => item.status === 'pending');
    const pendingPayments = paymentRequests.filter((item) => item.status === 'pending');
    const openPermits = permits.filter((permit) => !['passed', 'approved'].includes(permit.status));
    const unscheduledSlots = slots.filter((slot) => !slot.scheduled_start_date && ['filled', 'scheduled'].includes(slot.status));
    const overdueSlots = slots.filter((slot) => slot.scheduled_end_date && slot.scheduled_end_date < today && slot.status !== 'scheduled');
    const externalSlots = slots.filter((slot) => slot.fulfillment_type === 'external');
    const lateMaterialOrders = materialOrders.filter((order) => (
      order.delivery_deadline
      && order.delivery_deadline < today
      && !['delivered', 'confirmed', 'paid', 'cancelled'].includes(order.status)
    ));
    const activeMaterials = materialOrders.filter((order) => !['confirmed', 'paid', 'cancelled'].includes(order.status));
    const costImpact = pendingApprovals.reduce((sum, request) => sum + (request.cost_delta ?? 0), 0);
    const timelineImpact = pendingApprovals.reduce((sum, request) => sum + (request.timeline_delta_days ?? 0), 0);

    const summary = [
      `${formatGcProjectType(assignment?.project_type, project?.room_type)} is currently ${formatStatusLabel(project?.status ?? 'unknown')}.`,
      slots.length > 0
        ? `${slots.filter((slot) => ['filled', 'scheduled'].includes(slot.status)).length}/${slots.length} trade slots are assigned or scheduled.`
        : 'No trade slots have been generated yet.',
      pendingApprovals.length + pendingPayments.length > 0
        ? `${pendingApprovals.length + pendingPayments.length} homeowner decision${pendingApprovals.length + pendingPayments.length === 1 ? '' : 's'} are waiting.`
        : 'No homeowner approvals are currently waiting.',
      messages.length > 0 ? `${messages.length} recent project messages are available for context.` : 'No project messages have been recorded yet.',
    ];

    const risks = [
      ...openPermits.map((permit) => `${formatStatusLabel(permit.permit_type)} permit is ${formatStatusLabel(permit.status)}.`),
      ...unscheduledSlots.map((slot) => `${formatTrade(slot.trade_type)} is assigned but has no start date.`),
      ...overdueSlots.map((slot) => `${formatTrade(slot.trade_type)} has a scheduled end date in the past.`),
      ...lateMaterialOrders.map((order) => `A material order is past its delivery deadline and still ${formatStatusLabel(order.status)}.`),
      ...externalSlots.map((slot) => `${formatTrade(slot.trade_type)} is externally managed, so WalkerAI verification and escrow protection do not apply.`),
    ];

    const tasks = [
      ...pendingApprovals.map((request) => {
        const cost = request.cost_delta != null ? ` (${formatSignedCadCents(request.cost_delta)})` : '';
        return `Homeowner decision needed: ${request.title}${cost}.`;
      }),
      ...pendingPayments.map((request) => `Payment request pending: ${request.title} for ${formatCadCents(request.amount_cents)}.`),
      ...activeMaterials.map((order) => `Track material order currently ${formatStatusLabel(order.status)}.`),
      ...(costImpact !== 0 ? [`Pending approval cost impact totals ${formatSignedCadCents(costImpact)}.`] : []),
      ...(timelineImpact !== 0 ? [`Pending approval timeline impact totals ${timelineImpact > 0 ? '+' : ''}${timelineImpact} days.`] : []),
    ];

    return {
      summary,
      risks: risks.length ? risks : ['No schedule, permit, material, or external-trade risk flags from current project data.'],
      tasks: tasks.length ? tasks : ['No outstanding assistant tasks from current project data.'],
      pendingCount: pendingApprovals.length + pendingPayments.length,
      riskCount: risks.length,
    };
  }, [approvals, assignment?.project_type, materialOrders, messages.length, paymentRequests, permits, project?.room_type, project?.status, slots]);

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
              <Text style={styles.title}>Project Assistant</Text>
              <Text style={styles.subtitle}>Daily summary, risk flags, and outstanding tasks from live project records.</Text>
            </View>
          </View>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Assistant unavailable</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Generating project assistant summary...</Text>
            </GlassCard>
          ) : (
            <>
              <GlassCard style={styles.card}>
                <View style={styles.statusRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Today</Text>
                    <Text style={styles.bodyText}>Generated from project records. No manual edits or AI assumptions are applied.</Text>
                  </View>
                  <StatusBadge label={`${assistant.pendingCount} pending`} variant={assistant.pendingCount ? 'pending' : 'completed'} dot />
                </View>
                {assistant.summary.map((item) => <AssistantRow key={item} icon="text-box-check-outline" text={item} />)}
              </GlassCard>

              <GlassCard style={[styles.card, assistant.riskCount > 0 && styles.warningCard]}>
                <Text style={styles.sectionTitle}>Risk & delay alerts</Text>
                {assistant.risks.map((item) => <AssistantRow key={item} icon="alert-circle-outline" text={item} warning={assistant.riskCount > 0} />)}
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Outstanding task list</Text>
                {assistant.tasks.map((item) => <AssistantRow key={item} icon="checkbox-marked-circle-outline" text={item} />)}
              </GlassCard>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function AssistantRow({ icon, text, warning = false }: { icon: string; text: string; warning?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={warning ? Colors.warning : Colors.accent} />
      </View>
      <Text style={styles.rowText}>{text}</Text>
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
  warningCard: { borderColor: 'rgba(245,158,11,0.45)' },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  rowIcon: { width: 24, alignItems: 'center', paddingTop: 1 },
  rowText: { ...Typography.bodySecondary, flex: 1, lineHeight: 21 },
});
