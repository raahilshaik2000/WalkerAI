import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { restartProjectDispatch } from '@/lib/project-dispatch';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { readPersistedSurfaceSelections, surfaceSelectionSourceLabel } from '@/lib/room-customizer';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassCard, GradientBackground, StatusBadge, CardSkeleton } from '@/components/ui';
import type { ProjectStatus } from '@/constants/enums';

interface Project {
  id: string;
  address: string;
  room_type: string;
  status: ProjectStatus;
  scheduling_status: 'pending_homeowner' | 'confirmed' | null;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  questionnaire_answers: Record<string, unknown> | null;
  created_at: string;
  assigned_company?: {
    name: string;
    rating: number;
    total_reviews: number;
  } | null;
}

interface AssignedTradeSlot {
  id: string;
  trade_type: string;
  status: string;
  assigned_company_id: string | null;
  fulfillment_type?: 'walker_ai' | 'external' | null;
  external_trade_name?: string | null;
  external_trade_company?: string | null;
  external_trade_verification_status?: string | null;
  assigned_company?: {
    name: string;
    rating: number | null;
    total_reviews: number | null;
  } | null;
}

type ProjectRow = Omit<Project, 'assigned_company'> & {
  assigned_company?: Project['assigned_company'] | Project['assigned_company'][];
};

type AssignedTradeSlotRow = Omit<AssignedTradeSlot, 'assigned_company'> & {
  assigned_company?: AssignedTradeSlot['assigned_company'] | AssignedTradeSlot['assigned_company'][];
};

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100);
}

const TRADE_LABELS: Record<string, string> = {
  general_contractor: 'General contractor',
  plumber: 'Plumber',
  electrician: 'Electrician',
  tile_installer: 'Tile installer',
  cabinet_installer: 'Cabinet installer',
  painter: 'Painter',
  flooring_installer: 'Flooring installer',
  drywall: 'Drywall',
  demolition: 'Demolition',
};

const STATUS_VARIANT: Record<string, 'pending' | 'dispatching' | 'active' | 'completed' | 'error' | 'neutral'> = {
  draft: 'neutral',
  brief_ready: 'pending',
  dispatching: 'dispatching',
  scheduling: 'pending',
  accepted: 'info' as any,
  quoting: 'pending',
  active: 'active',
  completed: 'completed',
  cancelled: 'error',
  disputed: 'error',
  diy_saved: 'neutral',
};

/** Animated radar sonar for dispatching state */
function DispatchRadar() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );

    const a1 = pulse(ring1, 0);
    const a2 = pulse(ring2, 600);
    const a3 = pulse(ring3, 1200);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [ring1, ring2, ring3]);

  const ringStyle = (anim: Animated.Value) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 0.3, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
  });

  return (
    <View style={radarStyles.container}>
      {[ring1, ring2, ring3].map((r, i) => (
        <Animated.View key={i} style={[radarStyles.ring, ringStyle(r)]} />
      ))}
      <View style={radarStyles.core}>
        <Text style={radarStyles.coreText}>📡</Text>
      </View>
    </View>
  );
}

const radarStyles = StyleSheet.create({
  container: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: Spacing.md },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, borderColor: Colors.accent },
  core: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255, 107, 0, 0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.success },
  coreText: { fontSize: 22 },
});

export default function ProjectDetailScreen() {
  const route = useRoute<any>();
  const id = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const [project, setProject] = useState<Project | null>(null);
  const [assignedTradeSlots, setAssignedTradeSlots] = useState<AssignedTradeSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redispatching, setRedispatching] = useState(false);
  const finishSelections = readPersistedSurfaceSelections(project?.questionnaire_answers);

  const fetchProject = useCallback(async () => {
    if (!id) {
      setErrorMessage('Project is missing. Reopen the project from your dashboard.');
      setProject(null);
      setAssignedTradeSlots([]);
      setLoading(false);
      return;
    }

    const [projectResult, slotsResult] = await Promise.all([
      supabase
        .from('projects')
        .select(`
          id, address, room_type, status, scheduling_status, ai_cost_min, ai_cost_max, questionnaire_answers, created_at, assigned_company_id,
          assigned_company:companies!assigned_company_id ( name, rating, total_reviews )
        `)
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('project_slots')
        .select(`
          id, trade_type, status, assigned_company_id, fulfillment_type,
          external_trade_name, external_trade_company, external_trade_verification_status,
          assigned_company:companies!assigned_company_id ( name, rating, total_reviews )
        `)
        .eq('project_id', id)
        .in('status', ['filled', 'scheduled'])
        .order('created_at', { ascending: true }),
    ]);

    if (projectResult.error) {
      setErrorMessage(`Could not load project: ${projectResult.error.message}`);
      setProject(null);
      setAssignedTradeSlots([]);
      setLoading(false);
      return;
    }
    if (slotsResult.error) {
      setErrorMessage(`Could not load assigned trades: ${slotsResult.error.message}`);
      setProject(null);
      setAssignedTradeSlots([]);
      setLoading(false);
      return;
    }

    const row = projectResult.data as ProjectRow | null;
    const slotRows = (slotsResult.data ?? []) as AssignedTradeSlotRow[];
    setErrorMessage(null);
    setProject(row
      ? {
          ...row,
          assigned_company: Array.isArray(row.assigned_company)
            ? row.assigned_company[0] ?? null
            : row.assigned_company ?? null,
        }
      : null);
    setAssignedTradeSlots(slotRows.map((slot) => ({
      ...slot,
      assigned_company: Array.isArray(slot.assigned_company)
        ? slot.assigned_company[0] ?? null
        : slot.assigned_company ?? null,
    })));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!id) {
      fetchProject();
      return;
    }

    fetchProject();

    // Realtime subscription for status changes
    const channel = supabase
      .channel(`project:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${id}` }, () => {
        fetchProject();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchProject, id]);

  const handleRetryDispatch = async () => {
    if (!project?.id) return;

    setRedispatching(true);
    try {
      const data = await restartProjectDispatch(project.id, 4, { regenerateSlotsFirst: true });
      if (!data?.success) {
        throw new Error(data?.message ?? 'No verified contractors matched this project yet.');
      }

      setProject((current) => current ? { ...current, status: 'dispatching' } : current);
      Alert.alert('Search restarted', 'We are notifying matching contractors in the wider service area now.');
    } catch (err) {
      Alert.alert('Could not restart search', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRedispatching(false);
    }
  };

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.scroll}>
            <CardSkeleton />
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!project) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={Typography.h2}>{errorMessage ?? 'Project not found'}</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const isDispatching = project.status === 'dispatching';
  const shouldShowScheduleAction =
    project.status === 'scheduling' ||
    (project.status === 'quoting' && project.scheduling_status === 'pending_homeowner');
  const actions = [
    { label: 'Milestones', icon: '📋', screen: 'Milestones' },
    { label: 'Messages',   icon: '💬', screen: 'Messages'   },
    { label: 'Quote',      icon: '📄', screen: 'Quote'      },
    { label: 'Materials',  icon: '📦', screen: 'Materials'  },
    { label: 'Concierge',  icon: '🧭', screen: 'Concierge'  },
    ...(shouldShowScheduleAction
      ? [{ label: 'Schedule', icon: '📅', screen: 'ProjectSchedule' }]
      : []),
    { label: 'Permits',    icon: '🏛', screen: 'Permits'    },
    { label: 'Warranties', icon: '🛡', screen: 'Warranties' },
    { label: 'Changes',    icon: '📝', screen: 'ChangeOrders' },
    ...(project.status === 'completed'
      ? [{ label: 'Review', icon: '⭐', screen: 'Review' }]
      : []),
  ];

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <StatusBadge
              label={project.status.replace('_', ' ')}
              variant={STATUS_VARIANT[project.status] ?? 'neutral'}
              dot
            />
          </View>

          <Text style={styles.roomType}>{project.room_type === 'kitchen' ? '🍳' : '🚿'} {project.room_type}</Text>
          <Text style={styles.address}>{project.address}</Text>

          {/* Dispatch radar */}
          {isDispatching && (
            <GlassCard style={styles.card}>
              <DispatchRadar />
              <Text style={styles.dispatchTitle}>Finding your contractor</Text>
              <Text style={styles.dispatchSub}>
                We've notified verified contractors nearby. You'll get a notification the moment someone accepts.
              </Text>
            </GlassCard>
          )}

          {project.status === 'brief_ready' && (
            <GlassCard style={styles.card}>
              <Text style={styles.dispatchTitle}>No contractor accepted yet</Text>
              <Text style={styles.dispatchSub}>
                Restart the contractor search when you are ready. We will check the widest service area and only notify matching companies.
              </Text>
              <TouchableOpacity
                style={[styles.retryButton, redispatching && styles.retryButtonDisabled]}
                onPress={handleRetryDispatch}
                disabled={redispatching}
                activeOpacity={0.85}
              >
                <Text style={styles.retryButtonText}>
                  {redispatching ? 'Restarting search...' : 'Restart Contractor Search'}
                </Text>
              </TouchableOpacity>
            </GlassCard>
          )}

          {/* Assigned trades */}
          {assignedTradeSlots.length > 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Assigned Trades</Text>
              {assignedTradeSlots.map((slot) => (
                <View key={slot.id} style={styles.tradeRow}>
                  <View style={styles.tradeInfo}>
                    <Text style={styles.tradeType}>
                      {TRADE_LABELS[slot.trade_type] ?? slot.trade_type.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.companyName}>
                      {slot.fulfillment_type === 'external'
                        ? slot.external_trade_name ?? 'External trade'
                        : slot.assigned_company?.name ?? 'Contractor assigned'}
                    </Text>
                    {slot.fulfillment_type === 'external' ? (
                      <Text style={styles.externalTradeNotice}>
                        Externally managed by GC · Not WalkerAI verified · No escrow protection
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.tradeMeta}>
                    <Text style={styles.slotStatus}>
                      {slot.fulfillment_type === 'external' ? 'external' : slot.status.replace(/_/g, ' ')}
                    </Text>
                    <Text style={styles.companyRating}>
                      {slot.fulfillment_type === 'external'
                        ? 'GC responsibility'
                        : slot.assigned_company?.rating
                        ? `⭐ ${slot.assigned_company.rating.toFixed(1)} · ${slot.assigned_company.total_reviews ?? 0}`
                        : 'New'}
                    </Text>
                  </View>
                </View>
              ))}
            </GlassCard>
          ) : project.assigned_company ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Assigned Contractor</Text>
              <Text style={styles.companyName}>{project.assigned_company.name}</Text>
              <Text style={styles.companyRating}>
                ⭐ {project.assigned_company.rating?.toFixed(1) ?? 'New'} · {project.assigned_company.total_reviews} reviews
              </Text>
            </GlassCard>
          ) : null}

          {/* Cost estimate */}
          {project.ai_cost_min && project.ai_cost_max && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>AI Cost Estimate</Text>
              <Text style={styles.costRange}>
                {formatCad(project.ai_cost_min)} – {formatCad(project.ai_cost_max)}
              </Text>
              <Text style={styles.costNote}>Final price set by contractor quote</Text>
            </GlassCard>
          )}

          {finishSelections.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Finish Selections</Text>
              {finishSelections.map((selection, i) => (
                <View
                  key={selection.surfaceId}
                  style={[styles.finishRow, i < finishSelections.length - 1 && styles.finishRowBorder]}
                >
                  <View style={[styles.finishSwatch, { backgroundColor: selection.colorHex }]} />
                  <View style={styles.finishText}>
                    <Text style={styles.finishLabel}>{selection.surfaceLabel}</Text>
                    <Text style={styles.finishValue}>{selection.material} · {selection.colorName}</Text>
                    <Text style={styles.finishSource}>{surfaceSelectionSourceLabel(selection.source)}</Text>
                  </View>
                </View>
              ))}
            </GlassCard>
          )}

          {/* Action buttons */}
          <View style={styles.actionsGrid}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.actionCard}
                onPress={() => navigation.navigate(action.screen as any, { id })}
                activeOpacity={0.8}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  backBtn: {},
  backText: { color: Colors.text.secondary, fontSize: 15 },
  roomType: { ...Typography.h2, textTransform: 'capitalize', marginBottom: 6 },
  address: { ...Typography.bodySecondary, marginBottom: Spacing.md },
  card: { marginBottom: Spacing.sm },
  dispatchTitle: { ...Typography.h3, textAlign: 'center', marginBottom: 8 },
  dispatchSub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  retryButton: {
    marginTop: Spacing.md,
    minHeight: 50,
    borderRadius: Radius.item,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonDisabled: { opacity: 0.65 },
  retryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  tradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  tradeInfo: { flex: 1 },
  tradeMeta: { alignItems: 'flex-end', maxWidth: '42%' },
  tradeType: { fontSize: 13, fontWeight: '700', color: Colors.accent, marginBottom: 4, textTransform: 'capitalize' },
  slotStatus: { ...Typography.caption, color: Colors.text.secondary, textTransform: 'capitalize', marginBottom: 4 },
  companyName: { ...Typography.h3, marginBottom: 4 },
  externalTradeNotice: { ...Typography.caption, color: Colors.warning, marginTop: 4, lineHeight: 17 },
  companyRating: { ...Typography.caption },
  costRange: { fontSize: 28, fontWeight: '700', color: Colors.success, letterSpacing: -0.5, marginBottom: 4 },
  costNote: { ...Typography.caption },
  finishRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  finishRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.glass.border },
  finishSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  finishText: { flex: 1 },
  finishLabel: { fontSize: 12, fontWeight: '700', color: Colors.text.primary },
  finishValue: { ...Typography.caption, marginTop: 2 },
  finishSource: { fontSize: 11, color: Colors.text.tertiary, marginTop: 2 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: '47%',
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: { fontSize: 28 },
  actionLabel: { ...Typography.label },
});
