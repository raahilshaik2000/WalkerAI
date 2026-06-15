import { useCallback, useState } from 'react';
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
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GradientBackground, GlassCard, StatusBadge } from '@/components/ui';
import { TradeMetricStrip } from '@/components/company/TradeUI';

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
  const [slots, setSlots] = useState<Slot[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setErrorMessage(null);
      const [projectResult, slotResult, changeOrderResult] = await Promise.all([
        supabase
          .from('projects')
          .select('id, address, city, room_type, status, ai_cost_min, ai_cost_max, questionnaire_answers, created_at')
          .eq('id', projectId)
          .maybeSingle(),
        supabase
          .from('project_slots')
          .select('id, trade_type, status, assigned_company:companies!assigned_company_id(name)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase
          .from('change_orders')
          .select('id, description, cost_delta, status, signed_by_homeowner, signed_by_company')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (slotResult.error) throw slotResult.error;
      if (changeOrderResult.error) throw changeOrderResult.error;

      setProject(projectResult.data as ProjectDetail | null);
      setSlots((slotResult.data ?? []) as Slot[]);
      setChangeOrders((changeOrderResult.data ?? []) as ChangeOrder[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load managed project.');
      setProject(null);
      setSlots([]);
      setChangeOrders([]);
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

  const estimate = project?.ai_cost_min != null && project.ai_cost_max != null
    ? `${formatCad(project.ai_cost_min)} - ${formatCad(project.ai_cost_max)}`
    : project?.ai_cost_max != null || project?.ai_cost_min != null
    ? formatCad(project.ai_cost_max ?? project.ai_cost_min ?? 0)
    : 'Pending';
  const pendingApprovals = changeOrders.filter((order) => (
    order.status === 'proposed' && order.signed_by_company && !order.signed_by_homeowner
  )).length;
  const assignedTrades = slots.filter((slot) => !!getCompanyName(slot)).length;

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

              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Trade plan</Text>
                {slots.length === 0 ? (
                  <Text style={styles.bodyText}>Trade slots have not been generated yet.</Text>
                ) : slots.map((slot) => (
                  <View key={slot.id} style={styles.row}>
                    <View style={styles.rowIcon}>
                      <Icon name={getCompanyName(slot) ? 'check-circle-outline' : 'circle-outline'} size={18} color={getCompanyName(slot) ? Colors.success : Colors.text.tertiary} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{formatTrade(slot.trade_type)}</Text>
                      <Text style={styles.rowSub}>{getCompanyName(slot) ?? formatStatusLabel(slot.status)}</Text>
                    </View>
                  </View>
                ))}
              </GlassCard>

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
});
