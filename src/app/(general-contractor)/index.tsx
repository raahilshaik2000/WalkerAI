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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import type { GeneralContractor } from '@/types/database.types';
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { formatGcProjectType, gcProjectTypeIcon } from '@/lib/gc-project-type';
import { nextGeneralContractorOnboardingRoute } from '@/lib/general-contractor';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GradientBackground, ListItemSkeleton, StatusBadge } from '@/components/ui';
import { NotificationButton } from '@/components/notifications/NotificationButton';
import {
  TradeEmptyState,
  TradeMetricStrip,
  TradePanel,
  TradeScreenHeader,
  TradeSection,
} from '@/components/company/TradeUI';

interface GCProjectAssignment {
  id: string;
  status: string;
  markup_pct: number;
  concierge_fee_pct: number;
  project_type: string | null;
  scope_summary: string | null;
  homeowner_contact_name: string | null;
  homeowner_contact_email: string | null;
  homeowner_contact_phone: string | null;
  project: {
    id: string;
    address: string | null;
    city: string | null;
    room_type: string | null;
    status: string;
    ai_cost_min: number | null;
    ai_cost_max: number | null;
  } | null;
}

type GCProjectJoin = GCProjectAssignment['project'];

type GCProjectAssignmentRow = Omit<GCProjectAssignment, 'project'> & {
  project: GCProjectJoin | GCProjectJoin[] | null;
};

function projectStatusVariant(status: string): 'active' | 'completed' | 'pending' | 'dispatching' | 'neutral' {
  if (status === 'completed') return 'completed';
  if (status === 'dispatching') return 'dispatching';
  if (status === 'draft' || status === 'brief_ready' || status === 'scheduling' || status === 'quoting') return 'pending';
  if (status === 'accepted' || status === 'active') return 'active';
  return 'neutral';
}

function formatLocation(city?: string | null, address?: string | null) {
  return city || address || 'Location pending';
}

function estimateMidpoint(project: GCProjectAssignment['project']) {
  const min = project?.ai_cost_min;
  const max = project?.ai_cost_max;
  if (min != null && max != null) return Math.round((min + max) / 2);
  return max ?? min ?? 0;
}

export default function GeneralContractorDashboard() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [gc, setGc] = useState<GeneralContractor | null>(null);
  const [assignments, setAssignments] = useState<GCProjectAssignment[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = user ?? (await supabase.auth.getUser()).data.user;
    if (!currentUser) {
      setErrorMessage('You need to be signed in to view GC projects.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const { data: profile, error: profileError } = await supabase
        .from('general_contractors')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (profileError) throw profileError;
      setGc(profile as GeneralContractor | null);

      if (!profile?.id) {
        setAssignments([]);
        setPendingApprovals(0);
        return;
      }

      const { data: rows, error: assignmentError } = await supabase
        .from('general_contractor_projects')
        .select(`
          id, status, markup_pct, concierge_fee_pct, project_type, scope_summary,
          homeowner_contact_name, homeowner_contact_email, homeowner_contact_phone,
          project:projects ( id, address, city, room_type, status, ai_cost_min, ai_cost_max )
        `)
        .eq('general_contractor_id', profile.id)
        .neq('status', 'removed')
        .order('created_at', { ascending: false });
      if (assignmentError) throw assignmentError;

      const normalized: GCProjectAssignment[] = ((rows ?? []) as GCProjectAssignmentRow[]).map((row) => ({
        ...row,
        project: Array.isArray(row.project) ? row.project[0] ?? null : row.project ?? null,
      }));
      setAssignments(normalized);

      const [
        approvalCountResult,
        paymentCountResult,
        conciergeCompletionResult,
      ] = await Promise.all([
        supabase
          .from('project_approval_requests')
          .select('id', { count: 'exact', head: true })
          .eq('requested_by_gc_id', profile.id)
          .eq('status', 'pending'),
        supabase
          .from('gc_payment_requests')
          .select('id', { count: 'exact', head: true })
          .eq('general_contractor_id', profile.id)
          .eq('status', 'pending'),
        supabase
          .from('gc_concierge_bookings')
          .select('id', { count: 'exact', head: true })
          .eq('general_contractor_id', profile.id)
          .eq('status', 'accepted')
          .eq('payment_status', 'paid')
          .is('payout_released_at', null),
      ]);

      if (approvalCountResult.error) throw approvalCountResult.error;
      if (paymentCountResult.error) throw paymentCountResult.error;
      if (conciergeCompletionResult.error) throw conciergeCompletionResult.error;

      setPendingApprovals(
        (approvalCountResult.count ?? 0)
        + (paymentCountResult.count ?? 0)
        + (conciergeCompletionResult.count ?? 0),
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load GC dashboard.');
      setAssignments([]);
      setPendingApprovals(0);
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

  const setupRoute = nextGeneralContractorOnboardingRoute(gc);
  if (!loading && (!gc || setupRoute || !gc.verified)) {
    const setupIncomplete = !!setupRoute;
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.pendingContainer}>
            <View style={styles.onboardIconWrap}>
              <Icon
                name={setupIncomplete ? 'clipboard-text-outline' : gc ? 'magnify' : 'account-hard-hat-outline'}
                size={36}
                color={setupIncomplete || gc ? Colors.warning : Colors.success}
              />
            </View>
            <Text style={styles.pendingTitle}>
              {setupIncomplete ? 'Finish GC setup' : gc ? 'Verification in progress' : 'Set up your GC account'}
            </Text>
            <Text style={styles.pendingSubtitle}>
              {setupIncomplete
                ? 'Complete your license and insurance steps before WalkerAI can review your GC profile.'
                : gc
                ? 'Your GC profile is waiting for review. Managed projects will appear here once approved.'
                : 'Create your General Contractor profile to manage projects, markup, approvals, and concierge workflows.'}
            </Text>

            {setupIncomplete || !gc ? (
              <TouchableOpacity
                style={styles.onboardCta}
                onPress={() => navigation.navigate(setupRoute ?? 'GeneralContractorBusinessOnboarding')}
                activeOpacity={0.85}
              >
                <Text style={styles.onboardCtaText}>{setupIncomplete ? 'Continue Setup' : 'Get Started'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const activeAssignments = assignments.filter((item) => item.status === 'active' || item.status === 'invited');
  const managedValue = activeAssignments.reduce((sum, row) => sum + estimateMidpoint(row.project), 0);

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <TradeScreenHeader
            title="GC Desk"
            subtitle={gc?.business_name ? `${gc.business_name} · Project command center` : 'Project command center'}
            right={(
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.headerActionButton}
                  onPress={() => navigation.navigate('GeneralContractorCreateProject')}
                  activeOpacity={0.85}
                >
                  <Icon name="plus" size={20} color={Colors.text.primary} />
                </TouchableOpacity>
                <NotificationButton />
              </View>
            )}
          />

          <TradeMetricStrip
            items={[
              { label: 'Managed', value: activeAssignments.length, tone: activeAssignments.length ? 'success' : 'muted' },
              { label: 'Approvals', value: pendingApprovals, tone: pendingApprovals ? 'warning' : 'muted' },
              { label: 'Value', value: managedValue ? formatCad(managedValue) : '$0', tone: managedValue ? 'success' : 'muted' },
            ]}
          />

          {errorMessage ? (
            <TradeEmptyState icon="wifi-off" title="Could not load GC desk" body={errorMessage} />
          ) : loading ? (
            Array.from({ length: 3 }).map((_, index) => <ListItemSkeleton key={index} style={styles.skeletonSpacing} />)
          ) : assignments.length === 0 ? (
            <TradeEmptyState
              icon="briefcase-search-outline"
              title="No managed projects yet"
              body="When a homeowner invites you or a project is assigned for concierge management, it will appear here."
            />
          ) : (
            <TradeSection title="Managed projects">
              {assignments.map((assignment) => {
                const project = assignment.project;
                return (
                  <TouchableOpacity
                    key={assignment.id}
                    style={styles.projectCard}
                    onPress={() => {
                      if (project?.id) {
                        navigation.navigate('GeneralContractorProjectDetail', { id: project.id });
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <TradePanel>
                      <View style={styles.projectRow}>
                        <View style={styles.projectIcon}>
                          <Icon name={gcProjectTypeIcon(assignment.project_type, project?.room_type)} size={20} color={Colors.success} />
                        </View>
                        <View style={styles.projectContent}>
                          <Text style={styles.projectTitle}>{formatGcProjectType(assignment.project_type, project?.room_type)}</Text>
                          <Text style={styles.projectMeta}>{formatLocation(project?.city, project?.address)}</Text>
                          <Text style={styles.projectTerms}>
                            {Number(assignment.markup_pct).toFixed(0)}% markup · {Number(assignment.concierge_fee_pct).toFixed(0)}% concierge
                          </Text>
                          {assignment.homeowner_contact_name || assignment.homeowner_contact_email ? (
                            <Text style={styles.projectContact}>
                              {[assignment.homeowner_contact_name, assignment.homeowner_contact_email].filter(Boolean).join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.projectRight}>
                          <StatusBadge
                            label={formatStatusLabel(project?.status ?? assignment.status)}
                            variant={projectStatusVariant(project?.status ?? assignment.status)}
                            dot
                          />
                          <Icon name="chevron-right" size={18} color={Colors.text.tertiary} />
                        </View>
                      </View>
                      {assignment.scope_summary ? <Text style={styles.scopeSummary}>{assignment.scope_summary}</Text> : null}
                    </TradePanel>
                  </TouchableOpacity>
                );
              })}
            </TradeSection>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  onboardIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  pendingTitle: { ...Typography.h2, textAlign: 'center', marginBottom: 12 },
  pendingSubtitle: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22, maxWidth: 320, marginBottom: Spacing.lg },
  onboardCta: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.button,
    paddingHorizontal: 36,
    paddingVertical: 16,
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
  },
  onboardCtaText: { color: Colors.accentFg, fontWeight: '700', fontSize: 16 },
  skeletonSpacing: { marginBottom: 12 },
  projectCard: { marginBottom: 10 },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(34,197,94,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectContent: { flex: 1 },
  projectTitle: { ...Typography.h3, marginBottom: 4 },
  projectMeta: { ...Typography.caption, color: Colors.text.tertiary },
  projectTerms: { ...Typography.caption, color: Colors.text.secondary, marginTop: 2 },
  projectContact: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 2 },
  projectRight: { alignItems: 'flex-end', gap: 8 },
  scopeSummary: {
    ...Typography.caption,
    color: Colors.text.secondary,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
  },
});
