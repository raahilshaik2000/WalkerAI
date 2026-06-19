import { useCallback, useEffect, useState } from 'react';
import {
  Image,
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
import { signOut } from '@/lib/supabase/auth';
import { useAuthStore } from '@/stores/auth.store';
import { formatCad, formatStatusLabel } from '@/lib/formatters';
import { formatGcProjectType, gcProjectTypeIcon } from '@/lib/gc-project-type';
import { isMissingSupabaseSchemaObjectError } from '@/lib/supabase/errors';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { formatTradeLabel } from '@/lib/trade-labels';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { AnimatedPressable, GradientBackground, ListItemSkeleton, StatusBadge } from '@/components/ui';
import { NotificationButton } from '@/components/notifications/NotificationButton';
import {
  TradeEmptyState,
  TradeMetricStrip,
  TradePanel,
  TradeScreenHeader,
  TradeSection,
} from '@/components/company/TradeUI';

interface DispatchedJob {
  project_id: string;
  slot_id: string | null;
  dispatched_at: string;
  response: string;
  project: {
    id: string;
    address: string;
    city: string;
    room_type: string | null;
    gc_project_type?: string | null;
    status: string;
    ai_cost_min: number | null;
    ai_cost_max: number | null;
    dispatch_expires_at: string | null;
    renders?: Array<{ url: string; selected: boolean }> | null;
    project_photos?: Array<{ url: string; storage_path?: string | null }> | null;
  };
  slot?: {
    id: string;
    trade_type: string;
    estimated_cost_min: number | null;
    estimated_cost_max: number | null;
  } | Array<{
    id: string;
    trade_type: string;
    estimated_cost_min: number | null;
    estimated_cost_max: number | null;
  }> | null;
}

interface ActiveJob {
  id: string;
  slotId?: string | null;
  address: string | null;
  city: string | null;
  room_type: string | null;
  gc_project_type?: string | null;
  status: string;
  trade_type?: string | null;
}

interface GcProjectTypeRow {
  project_id: string;
  project_type: string | null;
}

function timeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
}

function formatRoom(projectType?: string | null, roomType?: string | null) {
  return formatGcProjectType(projectType, roomType);
}

function formatLocation(city?: string | null, address?: string | null) {
  return city || address || 'Location pending';
}

function formatTrade(tradeType?: string | null) {
  return formatTradeLabel(tradeType);
}

function projectStatusVariant(status: string): 'active' | 'completed' | 'pending' | 'dispatching' | 'neutral' {
  if (status === 'completed') return 'completed';
  if (status === 'scheduling' || status === 'quoting') return 'pending';
  if (status === 'dispatching') return 'dispatching';
  if (status === 'accepted' || status === 'active') return 'active';
  return 'neutral';
}

function getProjectCoverImage(project?: DispatchedJob['project'] | null) {
  const selectedRender = project?.renders?.find((render) => render.selected);
  const firstPhoto = [...(project?.project_photos ?? [])]
    .sort((a, b) => String(a.storage_path ?? '').localeCompare(String(b.storage_path ?? '')))[0];
  return selectedRender?.url ?? project?.renders?.[0]?.url ?? firstPhoto?.url ?? null;
}

export default function CompanyJobFeed() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<DispatchedJob[]>([]);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [company, setCompany] = useState<{
    id: string;
    verified: boolean;
    name: string;
    license_number: string | null;
    insurance_doc_url: string | null;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);

      const { data: co, error: companyError } = await supabase
        .from('companies')
        .select('id, verified, name, license_number, insurance_doc_url')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (companyError) throw companyError;
      setCompany(co);

      if (!co?.verified) {
        setJobs([]);
        setActiveJobs([]);
        return;
      }

      const [dispatchResult, acceptedDispatchResult, legacyActiveResult, slotActiveResult] = await Promise.all([
        supabase
          .from('dispatch_logs')
          .select(`
            project_id, slot_id, dispatched_at, response,
            project:projects (
              id, address, city, room_type, ai_cost_min, ai_cost_max, dispatch_expires_at, status,
              renders ( url, selected ),
              project_photos ( url, storage_path )
            ),
            slot:project_slots ( id, trade_type, estimated_cost_min, estimated_cost_max )
          `)
          .eq('company_id', co.id)
          .eq('response', 'pending')
          .order('dispatched_at', { ascending: false }),
        supabase
          .from('dispatch_logs')
          .select(`
            project_id, slot_id, dispatched_at, response,
            project:projects (
              id, address, city, room_type, status,
              renders ( url, selected ),
              project_photos ( url, storage_path )
            ),
            slot:project_slots ( id, trade_type )
          `)
          .eq('company_id', co.id)
          .eq('response', 'accepted')
          .order('dispatched_at', { ascending: false }),
        supabase
          .from('projects')
          .select('id, address, city, room_type, status')
          .eq('assigned_company_id', co.id)
          .in('status', ['accepted', 'quoting', 'active', 'scheduling', 'completed']),
        supabase
          .from('project_slots')
          .select(`
            id, trade_type, status,
            project:projects ( id, address, city, room_type, status )
          `)
          .eq('assigned_company_id', co.id)
          .in('status', ['filled', 'scheduled']),
      ]);

      if (dispatchResult.error) throw dispatchResult.error;
      if (acceptedDispatchResult.error) throw acceptedDispatchResult.error;
      if (legacyActiveResult.error) throw legacyActiveResult.error;
      if (slotActiveResult.error) throw slotActiveResult.error;

      const pendingDispatchRows = (dispatchResult.data ?? []) as unknown as DispatchedJob[];
      const acceptedDispatchRows = (acceptedDispatchResult.data ?? []) as unknown as DispatchedJob[];
      const legacyActiveRows = (legacyActiveResult.data ?? []) as ActiveJob[];
      const slotActiveRows = (slotActiveResult.data ?? []) as any[];
      const projectIds = new Set<string>();

      for (const dispatch of [...pendingDispatchRows, ...acceptedDispatchRows]) {
        const project = Array.isArray(dispatch.project) ? dispatch.project[0] : dispatch.project;
        if (project?.id) projectIds.add(project.id);
      }
      for (const project of legacyActiveRows) {
        if (project.id) projectIds.add(project.id);
      }
      for (const slot of slotActiveRows) {
        const project = Array.isArray(slot.project) ? slot.project[0] : slot.project;
        if (project?.id) projectIds.add(project.id);
      }

      const gcProjectTypes = new Map<string, string | null>();
      if (projectIds.size > 0) {
        const { data: gcContextRows, error: gcContextError } = await supabase
          .from('general_contractor_projects')
          .select('project_id, project_type')
          .in('project_id', Array.from(projectIds))
          .in('status', ['invited', 'active', 'completed']);

        if (gcContextError && !isMissingSupabaseSchemaObjectError(gcContextError, 'general_contractor_projects')) {
          throw gcContextError;
        }

        for (const row of (gcContextRows ?? []) as GcProjectTypeRow[]) {
          gcProjectTypes.set(row.project_id, row.project_type);
        }
      }

      const enrichDispatchProject = (dispatch: DispatchedJob): DispatchedJob => {
        const project = Array.isArray(dispatch.project) ? dispatch.project[0] : dispatch.project;
        return project
          ? { ...dispatch, project: { ...project, gc_project_type: gcProjectTypes.get(project.id) ?? null } }
          : dispatch;
      };

      const acceptedDispatchActive = acceptedDispatchRows
        .map((dispatch): ActiveJob | null => {
          const project = Array.isArray(dispatch.project) ? dispatch.project[0] : dispatch.project;
          const slot = Array.isArray(dispatch.slot) ? dispatch.slot[0] : dispatch.slot;
          if (!project) return null;
          return {
            id: project.id,
            slotId: dispatch.slot_id,
            address: project.address,
            city: project.city,
            room_type: project.room_type,
            gc_project_type: gcProjectTypes.get(project.id) ?? null,
            status: project.status,
            trade_type: slot?.trade_type ?? null,
          };
        })
        .filter((job): job is ActiveJob => !!job);

      const slotActive = slotActiveRows
        .map((slot): ActiveJob | null => {
          const project = Array.isArray(slot.project) ? slot.project[0] : slot.project;
          if (!project) return null;
          return {
            id: project.id,
            slotId: slot.id,
            address: project.address,
            city: project.city,
            room_type: project.room_type,
            gc_project_type: gcProjectTypes.get(project.id) ?? null,
            status: project.status ?? slot.status,
            trade_type: slot.trade_type,
          };
        })
        .filter((job): job is ActiveJob => !!job);

      const slotProjectIds = new Set(slotActive.map((job) => job.id));
      const legacyActive = legacyActiveRows
        .filter((job) => !slotProjectIds.has(job.id))
        .map((job) => ({
          ...job,
          slotId: null,
          gc_project_type: gcProjectTypes.get(job.id) ?? null,
        }));

      const byKey = new Map<string, ActiveJob>();
      [...legacyActive, ...acceptedDispatchActive, ...slotActive].forEach((job) => {
        byKey.set(`${job.id}:${job.slotId ?? 'legacy'}`, job);
      });

      setJobs(pendingDispatchRows.map(enrichDispatchProject));
      setActiveJobs(Array.from(byKey.values()));
    } catch (err) {
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load jobs.'));
      setJobs([]);
      setActiveJobs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    if (!company?.id || !company.verified) return;

    const channel = supabase
      .channel(`company-dispatches-${company.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dispatch_logs',
        filter: `company_id=eq.${company.id}`,
      }, () => fetchData())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          setErrorMessage('Live updates are unavailable. Pull to refresh jobs.');
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [company?.id, company?.verified, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const pendingEstimate = jobs.reduce((sum, job) => {
    const slot = Array.isArray(job.slot) ? job.slot[0] : job.slot;
    return sum + (
      slot?.estimated_cost_max
      ?? slot?.estimated_cost_min
      ?? job.project.ai_cost_max
      ?? job.project.ai_cost_min
      ?? 0
    );
  }, 0);

  // Company not verified — show onboarding CTA
  if (!loading && (!company || !company.verified)) {
    const isPending = !!company;
    const nextOnboardingRoute = !company
      ? 'BusinessOnboarding'
      : !company.license_number
      ? 'LicenseOnboarding'
      : !company.insurance_doc_url
      ? 'InsuranceOnboarding'
      : null;
    const setupIncomplete = !!company && !!nextOnboardingRoute;

    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.pendingContainer}>
            {/* Icon block */}
            <View style={styles.onboardIconWrap}>
              <Icon
                name={setupIncomplete ? 'clipboard-text-outline' : isPending ? 'magnify' : 'domain'}
                size={36}
                color={setupIncomplete || isPending ? Colors.warning : Colors.success}
              />
            </View>

            <Text style={styles.pendingTitle}>
              {setupIncomplete ? 'Finish contractor setup' : isPending ? 'Verification in progress' : 'Set up your profile'}
            </Text>
            <Text style={styles.pendingSubtitle}>
              {setupIncomplete
                ? 'Complete your license and insurance steps before WalkerAI can review your contractor profile.'
                : isPending
                ? 'Our team is reviewing your documents. You\'ll be able to receive jobs once approved — usually within 24 hours.'
                : 'Complete your contractor profile to start receiving jobs in your area.'}
            </Text>

            {isPending && !setupIncomplete ? (
              <View style={styles.pendingSteps}>
                {[
                  { label: 'Profile submitted', done: true },
                  { label: 'Documents under review', done: false, active: true },
                  { label: 'Verification complete', done: false },
                ].map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={[
                      styles.stepDot,
                      step.done && styles.stepDotDone,
                      step.active && styles.stepDotActive,
                    ]}>
                      {step.done && <Icon name="check" size={14} color="#fff" />}
                    </View>
                    <Text style={[
                      styles.stepText,
                      step.done && styles.stepTextDone,
                      step.active && styles.stepTextActive,
                    ]}>{step.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <>
                {/* Quick feature bullets */}
                {!setupIncomplete && <View style={styles.featureBullets}>
                  {[
                    { icon: 'map-marker-outline', text: 'Get jobs in your area' },
                    { icon: 'currency-usd', text: 'Set your own quotes' },
                    { icon: 'star-outline', text: 'Build your reputation' },
                  ].map((item, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Icon name={item.icon} size={20} color={Colors.success} />
                      <Text style={styles.bulletText}>{item.text}</Text>
                    </View>
                  ))}
                </View>}

                <TouchableOpacity
                  style={styles.onboardCta}
                  onPress={() => navigation.navigate(nextOnboardingRoute ?? 'BusinessOnboarding')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.onboardCtaText}>{setupIncomplete ? 'Continue Setup' : 'Get Started'}</Text>
                </TouchableOpacity>
                <Text style={styles.onboardTime}>
                  {setupIncomplete ? 'You can finish where you left off.' : 'Takes about 3 minutes'}
                </Text>

                <TouchableOpacity
                  style={styles.switchAccountBtn}
                  onPress={() => signOut()}
                  activeOpacity={0.7}
                >
                  <Text style={styles.switchAccountText}>
                    Not a contractor? <Text style={{ color: Colors.accent }}>Sign out & switch</Text>
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <TradeScreenHeader
            title="Trade Desk"
            subtitle={company?.name ? `${company.name} · Live work queue` : 'Live work queue'}
            right={<NotificationButton />}
          />

          <TradeMetricStrip
            items={[
              { label: 'Projects', value: activeJobs.length, tone: activeJobs.length ? 'success' : 'muted' },
              { label: 'Invites', value: jobs.length, tone: jobs.length ? 'warning' : 'muted' },
              { label: 'Potential', value: pendingEstimate ? formatCad(pendingEstimate) : '$0', tone: pendingEstimate ? 'success' : 'muted' },
            ]}
          />

          {/* Project section */}
          {activeJobs.length > 0 && (
            <TradeSection title="Projects">
              {activeJobs.map((job) => (
                <TouchableOpacity
                  key={`${job.id}:${job.slotId ?? 'legacy'}`}
                  style={styles.activeJobCard}
                  onPress={() => navigation.navigate('JobDetail', { screen: 'JobDetailMain', params: { id: job.id, slot: job.slotId } })}
                  activeOpacity={0.85}
                >
                  <TradePanel>
                    <View style={styles.activeJobRow}>
                      <View style={styles.jobIcon}>
                        <Icon name={gcProjectTypeIcon(job.gc_project_type, job.room_type)} size={20} color={Colors.success} />
                      </View>
                      <View style={styles.activeJobContent}>
                        <Text style={styles.activeJobRoom}>{formatRoom(job.gc_project_type, job.room_type)}</Text>
                        <Text style={styles.activeJobCity}>{formatLocation(job.city, job.address)}</Text>
                        {formatTrade(job.trade_type) ? (
                          <Text style={styles.activeJobTrade}>{formatTrade(job.trade_type)}</Text>
                        ) : null}
                      </View>
                      <View style={styles.rowRight}>
                        <StatusBadge label={formatStatusLabel(job.status)} variant={projectStatusVariant(job.status)} dot />
                        <Icon name="chevron-right" size={18} color={Colors.text.tertiary} />
                      </View>
                    </View>
                  </TradePanel>
                </TouchableOpacity>
              ))}
            </TradeSection>
          )}

          {/* Dispatched pending jobs */}
          {errorMessage ? (
            <TradeEmptyState
              icon="wifi-off"
              title="Could not load jobs"
              body={errorMessage}
            />
          ) : loading
            ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} style={styles.skeletonSpacing} />)
            : jobs.length > 0
            ? (
              <TradeSection title="New job invites">
                {jobs.map((job) => {
                  const project = job.project as DispatchedJob['project'];
                  const slot = Array.isArray(job.slot) ? job.slot[0] : job.slot;
                  const coverImage = getProjectCoverImage(project);
                  const tradeLabel = formatTrade(slot?.trade_type);
                  const timeLeft = timeRemaining(project.dispatch_expires_at);
                  const estimateMin = slot?.estimated_cost_min ?? project.ai_cost_min;
                  const estimateMax = slot?.estimated_cost_max ?? project.ai_cost_max;

                  return (
                    <AnimatedPressable
                      key={`${job.project_id}:${job.slot_id ?? 'legacy'}`}
                      onPress={() => navigation.navigate('JobDetail', { screen: 'JobDetailMain', params: { id: project.id, slot: job.slot_id } })}
                      haptic
                    >
                      <TradePanel style={styles.jobCard}>
                        {coverImage ? (
                          <Image source={{ uri: coverImage }} style={styles.jobPreview} resizeMode="cover" />
                        ) : null}
                        <View style={styles.jobHeader}>
                          <View style={styles.jobIcon}>
                            <Icon name={gcProjectTypeIcon(project.gc_project_type, project.room_type)} size={20} color={Colors.warning} />
                          </View>
                          <View style={styles.pendingJobContent}>
                            <View style={styles.urgencyRow}>
                              <Icon name="timer-sand" size={13} color={Colors.warning} />
                              <Text style={styles.urgencyText}>{timeLeft}</Text>
                            </View>
                            <Text style={styles.jobRoomType}>{formatRoom(project.gc_project_type, project.room_type)}</Text>
                            {tradeLabel ? <Text style={styles.jobTrade}>{tradeLabel}</Text> : null}
                            <Text style={styles.jobCity}>{formatLocation(project.city, project.address)}</Text>
                          </View>
                          <Icon name="chevron-right" size={20} color={Colors.text.tertiary} />
                        </View>

                        {estimateMin && estimateMax && (
                          <View style={styles.estimateRow}>
                            <Text style={styles.estimateLabel}>Estimated range</Text>
                            <Text style={styles.estimatedCost}>
                              {formatCad(estimateMin)} – {formatCad(estimateMax)}
                            </Text>
                          </View>
                        )}
                      </TradePanel>
                    </AnimatedPressable>
                  );
                })}
              </TradeSection>
            )
            : activeJobs.length === 0 && (
              <TradeEmptyState
                icon="briefcase-search-outline"
                title="No jobs yet"
                body="New jobs in your area will appear here automatically. Pull to refresh."
              />
            )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  pendingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  onboardIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface.default,
    borderWidth: 1, borderColor: Colors.surface.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  onboardIcon: { fontSize: 36 },
  pendingTitle: { ...Typography.h2, textAlign: 'center', marginBottom: 12 },
  pendingSubtitle: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  featureBullets: { marginTop: Spacing.lg, marginBottom: Spacing.lg, gap: 14, width: '100%', maxWidth: 260 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bulletIcon: { fontSize: 20 },
  bulletText: { ...Typography.body, color: Colors.text.secondary },
  onboardCta: {
    backgroundColor: Colors.accent, borderRadius: Radius.button,
    paddingHorizontal: 36, paddingVertical: 16, width: '100%', maxWidth: 280, alignItems: 'center',
  },
  onboardCtaText: { color: Colors.accentFg, fontWeight: '700', fontSize: 16 },
  onboardTime: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 10 },
  switchAccountBtn: { marginTop: Spacing.lg },
  switchAccountText: { ...Typography.caption, color: Colors.text.tertiary, textAlign: 'center' },
  pendingSteps: { marginTop: Spacing.lg, gap: 16, width: '100%', maxWidth: 260 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: Colors.surface.borderStrong, alignItems: 'center', justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  stepDotActive: { borderColor: Colors.success },
  stepCheck: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepText: { ...Typography.body, color: Colors.text.tertiary },
  stepTextDone: { color: Colors.text.secondary },
  stepTextActive: { color: Colors.text.primary, fontWeight: '600' },
  greeting: { ...Typography.h1, marginBottom: 4 },
  companyName: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  activeJobCard: { marginBottom: 10 },
  activeJobRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  activeJobContent: { flex: 1 },
  activeJobRoom: { ...Typography.h3, marginBottom: 4 },
  activeJobCity: { ...Typography.caption, color: Colors.text.tertiary },
  activeJobTrade: { ...Typography.caption, color: Colors.text.secondary, textTransform: 'capitalize', marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 8 },
  jobIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobCard: { marginBottom: 12 },
  jobPreview: {
    width: '100%',
    height: 150,
    borderRadius: Radius.item,
    marginBottom: 12,
    backgroundColor: Colors.surface.default,
  },
  skeletonSpacing: { marginBottom: 12 },
  pendingJobContent: { flex: 1 },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  urgencyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },
  urgencyText: { color: Colors.warning, fontSize: 12, fontWeight: '700' },
  jobHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobRoomType: { ...Typography.h3, marginBottom: 4 },
  jobTrade: { ...Typography.caption, color: Colors.warning, textTransform: 'capitalize', marginBottom: 3 },
  jobCity: { ...Typography.caption, color: Colors.text.tertiary },
  estimateRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.surface.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  estimateLabel: { ...Typography.caption, color: Colors.text.tertiary },
  estimatedCost: { color: Colors.success, fontWeight: '800', fontSize: 15 },
  tapToView: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.h3, marginBottom: 8 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
});
