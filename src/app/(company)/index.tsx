import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { signOut } from '@/lib/supabase/auth';
import { useAuthStore } from '@/stores/auth.store';
import { formatCad } from '@/lib/formatters';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { AnimatedPressable, GlassCard, GradientBackground, ListItemSkeleton, StatusBadge } from '@/components/ui';

interface DispatchedJob {
  project_id: string;
  dispatched_at: string;
  response: string;
  project: {
    id: string;
    address: string;
    city: string;
    room_type: string;
    ai_cost_min: number | null;
    ai_cost_max: number | null;
    dispatch_expires_at: string | null;
  };
}

function timeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
}

export default function CompanyJobFeed() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<DispatchedJob[]>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [company, setCompany] = useState<{ id: string; verified: boolean; name: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;

    // Get company
    const { data: co } = await supabase
      .from('companies')
      .select('id, verified, name')
      .eq('user_id', user.id)
      .single();

    setCompany(co);

    if (!co?.verified) {
      setLoading(false);
      return;
    }

    // Get dispatched pending jobs
    const { data: dispatches } = await supabase
      .from('dispatch_logs')
      .select(`
        project_id, dispatched_at, response,
        project:projects ( id, address, city, room_type, ai_cost_min, ai_cost_max, dispatch_expires_at, status )
      `)
      .eq('company_id', co.id)
      .eq('response', 'pending')
      .order('dispatched_at', { ascending: false });

    // Get active jobs (accepted)
    const { data: active } = await supabase
      .from('projects')
      .select('id, address, city, room_type, status')
      .eq('assigned_company_id', co.id)
      .in('status', ['accepted', 'quoting', 'active']);

    setJobs((dispatches ?? []) as unknown as DispatchedJob[]);
    setActiveJobs(active ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    fetchData();

    // Realtime: new dispatch notifications
    const channel = supabase
      .channel('company-dispatches')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dispatch_logs',
        filter: company ? `company_id=eq.${company.id}` : undefined,
      }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Company not verified — show onboarding CTA
  if (!loading && (!company || !company.verified)) {
    const isPending = !!company;
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.pendingContainer}>
            {/* Icon block */}
            <View style={styles.onboardIconWrap}>
              <Icon name={isPending ? 'magnify' : 'domain'} size={36} color={isPending ? Colors.warning : Colors.success} />
            </View>

            <Text style={styles.pendingTitle}>
              {isPending ? 'Verification in progress' : 'Set up your profile'}
            </Text>
            <Text style={styles.pendingSubtitle}>
              {isPending
                ? 'Our team is reviewing your documents. You\'ll be able to receive jobs once approved — usually within 24 hours.'
                : 'Complete your contractor profile to start receiving jobs in your area.'}
            </Text>

            {isPending ? (
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
                <View style={styles.featureBullets}>
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
                </View>

                <TouchableOpacity
                  style={styles.onboardCta}
                  onPress={() => navigation.navigate('BusinessOnboarding')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.onboardCtaText}>Get Started</Text>
                </TouchableOpacity>
                <Text style={styles.onboardTime}>Takes about 3 minutes</Text>

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
          <Text style={styles.greeting}>Jobs</Text>
          {company?.name && <Text style={styles.companyName}>{company.name}</Text>}

          {/* Active jobs section */}
          {activeJobs.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>ACTIVE PROJECTS</Text>
              {activeJobs.map((job) => (
                <TouchableOpacity
                  key={job.id}
                  style={styles.activeJobCard}
                  onPress={() => navigation.navigate('JobDetail', { id: job.id })}
                  activeOpacity={0.85}
                >
                  <GlassCard padding={16} style={{ marginBottom: 0 }}>
                    <View style={styles.activeJobRow}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Icon name={job.room_type === 'kitchen' ? 'countertop-outline' : 'shower'} size={18} color={Colors.text.primary} />
                          <Text style={styles.activeJobRoom}>{job.room_type}</Text>
                        </View>
                        <Text style={styles.activeJobCity}>{job.city}</Text>
                      </View>
                      <StatusBadge label={job.status} variant="active" dot />
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </>
          )}

          {/* Dispatched pending jobs */}
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} style={{ marginBottom: 12 }} />)
            : jobs.length > 0
            ? (
              <>
                <Text style={styles.sectionLabel}>NEW JOBS — FIRST TO ACCEPT WINS</Text>
                {jobs.map((job) => {
                  const project = job.project as DispatchedJob['project'];
                  const timeLeft = timeRemaining(project.dispatch_expires_at);

                  return (
                    <AnimatedPressable
                      key={job.project_id}
                      onPress={() => navigation.navigate('JobDetail', { id: project.id })}
                      haptic
                    >
                      <GlassCard style={styles.jobCard}>
                        {/* Urgency indicator */}
                        <View style={styles.urgencyRow}>
                          <View style={styles.urgencyDot} />
                          <Icon name="lightning-bolt" size={14} color={Colors.warning} />
                          <Text style={styles.urgencyText}>{timeLeft}</Text>
                        </View>

                        <View style={styles.jobHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Icon name={project.room_type === 'kitchen' ? 'countertop-outline' : 'shower'} size={18} color={Colors.text.primary} />
                            <Text style={styles.jobRoomType}>
                              {project.room_type.charAt(0).toUpperCase() + project.room_type.slice(1)} Renovation
                            </Text>
                          </View>
                          <Text style={styles.jobCity}>{project.city}</Text>
                        </View>

                        {project.ai_cost_min && project.ai_cost_max && (
                          <Text style={styles.estimatedCost}>
                            {formatCad(project.ai_cost_min)} – {formatCad(project.ai_cost_max)} estimated
                          </Text>
                        )}

                        <Text style={styles.tapToView}>Tap to view brief →</Text>
                      </GlassCard>
                    </AnimatedPressable>
                  );
                })}
              </>
            )
            : activeJobs.length === 0 && (
              <View style={styles.emptyState}>
                <Icon name="mailbox-open-outline" size={48} color={Colors.text.tertiary} />
                <Text style={styles.emptyTitle}>No jobs yet</Text>
                <Text style={styles.emptySub}>
                  New jobs in your area will appear here automatically. Pull to refresh.
                </Text>
              </View>
            )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
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
  sectionLabel: { ...Typography.label, color: Colors.accent, marginBottom: 12, marginTop: Spacing.sm },
  activeJobCard: { marginBottom: 10 },
  activeJobRow: { flexDirection: 'row', alignItems: 'center' },
  activeJobRoom: { ...Typography.h3, textTransform: 'capitalize', marginBottom: 4 },
  activeJobCity: { ...Typography.caption },
  jobCard: { marginBottom: 12 },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  urgencyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.warning },
  urgencyText: { color: Colors.warning, fontSize: 12, fontWeight: '700' },
  jobHeader: { marginBottom: 8 },
  jobRoomType: { ...Typography.h3, textTransform: 'capitalize', marginBottom: 4 },
  jobCity: { ...Typography.bodySecondary },
  estimatedCost: { color: Colors.success, fontWeight: '600', fontSize: 15, marginBottom: 10 },
  tapToView: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { ...Typography.h3, marginBottom: 8 },
  emptySub: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
});
