import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, CardSkeleton } from '@/components/ui';
import { formatStatusLabel, formatCad } from '@/lib/formatters';
import { readPersistedSurfaceSelections, surfaceSelectionSourceLabel } from '@/lib/room-customizer';
import {
  TradeActionTile,
  TradeMetricStrip,
  TradePanel,
  TradeSection,
} from '@/components/company/TradeUI';

const TRADE_LABELS: Record<string, string> = {
  general_contractor: 'General Contractor',
  plumber: 'Plumber',
  electrician: 'Electrician',
  tile_installer: 'Tile Installer',
  cabinet_installer: 'Cabinet Installer',
  painter: 'Painter',
  flooring_installer: 'Flooring Installer',
  drywall: 'Drywall',
  demolition: 'Demolition',
};

function formatLocation(address?: string | null, city?: string | null) {
  if (address && city) return `${address}, ${city}`;
  return address || city || 'Location pending';
}

interface Slot {
  id: string;
  trade_type: string;
  description: string;
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
  status: string;
  assigned_company_id: string | null;
}

interface JobBrief {
  id: string;
  address: string;
  city: string;
  room_type: string;
  status: string;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  assigned_company_id: string | null;
  ai_analysis: Record<string, unknown> | null;
  questionnaire_answers: Record<string, unknown> | null;
  materials: Array<{ item: string; quantity: number; unit: string; quality_tier: string }>;
  scope_of_work: Array<{ phase: string; description: string; sort_order: number }>;
  renders: Array<{ url: string; selected: boolean }>;
  dispatch_expires_at: string | null;
}

interface CompanyPayoutProfile {
  id: string;
  stripe_account_id: string | null;
  stripe_details_submitted?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_transfers_active?: boolean | null;
}

async function fetchCompanyPayoutProfile(userId: string): Promise<CompanyPayoutProfile | null> {
  const withReadiness = await supabase
    .from('companies')
    .select('id, stripe_account_id, stripe_details_submitted, stripe_payouts_enabled, stripe_transfers_active')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!withReadiness.error) {
    return withReadiness.data as CompanyPayoutProfile | null;
  }

  // Tolerate both Postgres ("column ... does not exist") and PostgREST
  // ("Could not find the 'X' column of 'Y' in the schema cache") formats.
  const errMsg = withReadiness.error.message;
  const isMissingCol = /column .* does not exist/i.test(errMsg)
    || /could not find the .* column of/i.test(errMsg);
  if (!isMissingCol) {
    throw withReadiness.error;
  }

  const legacyProfile = await supabase
    .from('companies')
    .select('id, stripe_account_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (legacyProfile.error) throw legacyProfile.error;
  return legacyProfile.data as CompanyPayoutProfile | null;
}

export default function JobBriefScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const slotId: string | undefined = route.params?.slot;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [job, setJob] = useState<JobBrief | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [payoutReady, setPayoutReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const finishSelections = readPersistedSurfaceSelections(job?.questionnaire_answers);

  const fetchJob = useCallback(async () => {
    if (!projectId || !user?.id) {
      setErrorMessage('Job is missing. Reopen this invite from the job feed.');
      setJob(null);
      setLoading(false);
      return;
    }

    try {
      setErrorMessage(null);
      const [projectResult, slotResult, companyData] = await Promise.all([
        supabase
          .from('projects')
          .select(`
            id, address, city, room_type, status, assigned_company_id, ai_cost_min, ai_cost_max,
            ai_analysis, questionnaire_answers, dispatch_expires_at,
            materials ( item, quantity, unit, quality_tier ),
            scope_of_work ( phase, description, sort_order ),
            renders ( url, selected )
          `)
          .eq('id', projectId)
          .maybeSingle(),
        slotId
          ? supabase
              .from('project_slots')
              .select('id, trade_type, description, estimated_cost_min, estimated_cost_max, status, assigned_company_id')
              .eq('id', slotId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        fetchCompanyPayoutProfile(user.id),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (slotResult.error) throw slotResult.error;
      if (!projectResult.data) throw new Error('Job not found or no longer available.');
      if (slotId && !slotResult.data) throw new Error('This trade slot is no longer available.');
      if (!companyData) throw new Error('Company profile is missing. Complete contractor onboarding before accepting jobs.');

      const projectData = projectResult.data;
      const slotData = slotResult.data;

      setJob(projectData as JobBrief);
      if (slotData) setSlot(slotData as Slot);
      setPayoutReady(isStripePayoutLocallyReady(companyData));
      const companyId = companyData?.id;
      const slotInfo = slotData as Slot | null;
      const projectInfo = projectData as JobBrief | null;

      if (slotInfo) {
        const slotClaimed = slotInfo.status === 'filled' || slotInfo.status === 'scheduled';
        setAlreadyAccepted(slotClaimed && slotInfo.assigned_company_id === companyId);
        setUnavailable(slotClaimed && slotInfo.assigned_company_id !== companyId);
      } else {
        const projectClaimed = projectInfo?.status !== 'dispatching';
        const directlyAssigned = projectInfo?.assigned_company_id === companyId;
        let acceptedByDispatch = false;

        if (projectClaimed && !directlyAssigned) {
          const { data: acceptedDispatch, error: acceptedDispatchError } = await supabase
            .from('dispatch_logs')
            .select('id')
            .eq('project_id', projectId)
            .eq('company_id', companyId)
            .eq('response', 'accepted')
            .limit(1)
            .maybeSingle();
          if (acceptedDispatchError) throw acceptedDispatchError;
          acceptedByDispatch = !!acceptedDispatch;
        }

        const acceptedByCurrentCompany = directlyAssigned || acceptedByDispatch;
        setAlreadyAccepted(!!projectClaimed && acceptedByCurrentCompany);
        setUnavailable(!!projectClaimed && !acceptedByCurrentCompany);
      }
      setLoading(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load this job.');
      setJob(null);
      setSlot(null);
      setAlreadyAccepted(false);
      setUnavailable(false);
      setLoading(false);
    }
  }, [projectId, slotId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchJob();
    }, [fetchJob])
  );

  const handleAccept = async () => {
    if (!projectId) {
      Alert.alert('Missing job', 'Reopen this invite from the job feed and try again.');
      return;
    }
    if (!payoutReady) {
      Alert.alert(
        'Finish payout setup first',
        'Stripe payouts must be active before you can accept jobs. Finish Stripe onboarding in your profile.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Set up Payouts', onPress: () => navigation.navigate('CompanyTabs', { screen: 'CompanyProfile' }) },
        ]
      );
      return;
    }
    setAccepting(true);
    try {
      const body = slotId
        ? { slot_id: slotId }
        : { project_id: projectId };

      const { data, error } = await supabase.functions.invoke('accept-job', { body });

      if (error) throw new Error(await formatSupabaseFunctionError(error));

      if (data?.code === 'SLOT_FILLED' || data?.code === 'JOB_FILLED') {
        Alert.alert('Job taken', 'Another contractor claimed this work just before you. Keep an eye out for the next one.');
        setAlreadyAccepted(false);
        setUnavailable(true);
        return;
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setAlreadyAccepted(true);
      setUnavailable(false);
      fetchJob();
      const shouldStartQuote = !!slotId || !!data?.needs_quote;
      const actions = shouldStartQuote
        ? [
            { text: 'Start Quote', onPress: () => navigation.navigate('QuoteBuilder', { id: projectId, slot: slotId }) },
            { text: 'Verify Materials', onPress: () => navigation.navigate('JobMaterials', { id: projectId }) },
          ]
        : [
            { text: 'Verify Materials', onPress: () => navigation.navigate('JobMaterials', { id: projectId }) },
            { text: 'View Job', onPress: () => undefined },
          ];
      Alert.alert(
        slotId ? 'Slot accepted!' : 'Job accepted!',
        shouldStartQuote
          ? 'The homeowner has been notified. Submit your trade quote, then verify material quantities.'
          : 'The homeowner has been notified. A pending quote was created from the AI price, so verify material quantities next.',
        actions
      );
    } catch (err) {
      const msg = await formatSupabaseFunctionError(err, 'Failed to accept job.');
      if (msg.includes('lock') || msg.includes('RACE')) {
        Alert.alert('Try again', 'Another contractor is claiming this slot right now. Try again.');
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <CardSkeleton />
            <CardSkeleton style={{ marginTop: 12 }} />
          </ScrollView>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!job) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            <Text style={Typography.h2}>{errorMessage ?? 'Job not found'}</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const selectedRender = job.renders?.find((r) => r.selected) ?? job.renders?.[0];

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <StatusBadge label={formatStatusLabel(job.status)} variant={job.status === 'dispatching' ? 'dispatching' : 'active'} dot />
          </View>

          {/* Slot banner — shown when dispatched to a specific trade */}
          {slot && (
            <View style={styles.slotBanner}>
              <View style={styles.slotBannerIcon}>
                <Ionicons name="construct-outline" size={18} color="#FF6B00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotBannerTrade}>{TRADE_LABELS[slot.trade_type] ?? slot.trade_type} Slot</Text>
                {slot.description ? (
                  <Text style={styles.slotBannerDesc} numberOfLines={2}>{slot.description}</Text>
                ) : null}
              </View>
              {slot.estimated_cost_min && slot.estimated_cost_max ? (
                <Text style={styles.slotBannerCost}>
                  {formatCad(slot.estimated_cost_min)}–{formatCad(slot.estimated_cost_max)}
                </Text>
              ) : null}
            </View>
          )}

          {/* Hero render */}
          {selectedRender ? (
            <Image source={{ uri: selectedRender.url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroFallback}>
              <Icon
                name={job.room_type === 'kitchen' ? 'countertop-outline' : 'shower'}
                size={48}
                color={Colors.text.tertiary}
              />
            </View>
          )}

          <View style={styles.roomTypeRow}>
            {job.room_type === 'kitchen' ? (
              <Icon name="countertop-outline" size={18} color={Colors.text.primary} />
            ) : (
              <Icon name="shower" size={18} color={Colors.text.primary} />
            )}
            <Text style={styles.roomType}>
              {job.room_type.charAt(0).toUpperCase() + job.room_type.slice(1)} Renovation
            </Text>
          </View>
          <Text style={styles.address}>{formatLocation(job.address, job.city)}</Text>

          <TradeMetricStrip
            items={[
              { label: 'Scope items', value: job.scope_of_work?.length ?? 0, tone: 'muted' },
              { label: 'Materials', value: job.materials?.length ?? 0, tone: 'muted' },
              { label: 'Status', value: formatStatusLabel(job.status), tone: job.status === 'dispatching' ? 'warning' : 'success' },
            ]}
          />

          {/* Cost estimate */}
          {job.ai_cost_min && job.ai_cost_max && (
            <TradePanel style={styles.card}>
              <Text style={styles.sectionLabel}>AI Cost Estimate</Text>
              <Text style={styles.costRange}>
                {formatCad(job.ai_cost_min)} – {formatCad(job.ai_cost_max)}
              </Text>
              <Text style={styles.costNote}>Use as guidance for your quote</Text>
            </TradePanel>
          )}

          {/* AI Analysis summary */}
          {!!job.ai_analysis?.ai_observations && (
            <TradePanel style={styles.card}>
              <Text style={styles.sectionLabel}>AI Analysis</Text>
              <Text style={styles.analysisText}>{String(job.ai_analysis.ai_observations)}</Text>
            </TradePanel>
          )}

          {finishSelections.length > 0 && (
            <TradeSection title="Homeowner finish selections">
              <TradePanel style={styles.card}>
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
              </TradePanel>
            </TradeSection>
          )}

          {/* Scope of work */}
          {job.scope_of_work && job.scope_of_work.length > 0 && (
            <TradeSection title="Scope of work">
            <TradePanel style={styles.card}>
              {[...job.scope_of_work]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item, i) => (
                  <View key={i} style={styles.scopeRow}>
                    <View style={styles.phaseTag}>
                      <Text style={styles.phaseText}>{item.phase}</Text>
                    </View>
                    <Text style={styles.scopeDesc}>{item.description}</Text>
                  </View>
                ))}
            </TradePanel>
            </TradeSection>
          )}

          {/* Materials */}
          {job.materials && job.materials.length > 0 && (
            <TradeSection title="Materials">
            <TradePanel style={styles.card}>
              {job.materials.map((mat, i) => (
                <View key={i} style={styles.matRow}>
                  <Text style={styles.matItem}>{mat.item}</Text>
                  <Text style={styles.matQty}>{mat.quantity} {mat.unit}</Text>
                </View>
              ))}
            </TradePanel>
            </TradeSection>
          )}

          {/* Accept CTA */}
          {unavailable ? (
            <GlassCard style={[styles.card, styles.acceptedCard]}>
              <Text style={styles.acceptedText}>Job no longer available</Text>
            </GlassCard>
          ) : !alreadyAccepted ? (
            <>
              <GlassButton
                label="Accept This Job"
                onPress={handleAccept}
                loading={accepting}
                fullWidth
                size="lg"
                haptic
                style={styles.acceptBtn}
              />
              <Text style={styles.acceptNote}>
                By accepting, you agree to submit a detailed quote within 48 hours.
              </Text>
            </>
          ) : alreadyAccepted ? (
            <>
              <GlassCard style={[styles.card, styles.acceptedCard]}>
                <View style={styles.acceptedRow}>
                  <Icon name="check-circle" size={18} color={Colors.success} />
                  <Text style={styles.acceptedText}>Job accepted</Text>
                </View>
              </GlassCard>
              <View style={styles.actionGrid}>
                {[
                  { label: 'Quote', iconName: 'file-document-edit-outline', route: 'QuoteBuilder', meta: 'Build quote' },
                  { label: 'Payments', iconName: 'cash-multiple', route: 'JobMilestones', meta: 'Milestones' },
                  { label: 'Materials', iconName: 'cube-outline', route: 'JobMaterials', meta: 'Verify counts' },
                  { label: 'Messages', iconName: 'chat-outline', route: 'JobMessages', meta: 'Project thread' },
                  { label: 'Changes', iconName: 'pencil-outline', route: 'JobChangeOrders', meta: 'Change orders' },
                  { label: 'Warranties', iconName: 'shield-check-outline', route: 'JobWarranties', meta: 'Closeout docs' },
                  ...(job.status === 'completed'
                    ? [{ label: 'Review', iconName: 'star-outline', route: 'JobReview', meta: 'Homeowner' }]
                    : []),
                ].map((item) => (
                  <TradeActionTile
                    key={item.route}
                    label={item.label}
                    icon={item.iconName}
                    meta={item.meta}
                    onPress={() => navigation.navigate(item.route as any, { id: projectId, slot: slotId })}
                  />
                ))}
              </View>
            </>
          ) : (
            <GlassCard style={[styles.card, styles.acceptedCard]}>
              <Text style={styles.acceptedText}>Refresh this job to see the latest availability.</Text>
            </GlassCard>
          )}
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
  heroImage: { width: '100%', height: 200, borderRadius: Radius.card, marginBottom: Spacing.md },
  heroFallback: {
    width: '100%',
    height: 200,
    borderRadius: Radius.card,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  roomType: { ...Typography.h2, textTransform: 'capitalize' },
  address: { ...Typography.bodySecondary, marginBottom: Spacing.md },
  card: { marginBottom: Spacing.sm },
  sectionLabel: { ...Typography.label, marginBottom: 10 },
  costRange: { fontSize: 26, fontWeight: '700', color: Colors.success, letterSpacing: -0.5, marginBottom: 4 },
  costNote: { ...Typography.caption },
  analysisText: { ...Typography.bodySecondary, lineHeight: 22 },
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
  scopeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  phaseTag: {
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 90,
  },
  phaseText: { color: Colors.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center' },
  scopeDesc: { ...Typography.bodySecondary, flex: 1, lineHeight: 20 },
  matRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.glass.border },
  matItem: { ...Typography.body, flex: 1 },
  matQty: { ...Typography.caption },
  acceptBtn: { marginBottom: Spacing.xs },
  acceptNote: { ...Typography.caption, textAlign: 'center', paddingHorizontal: Spacing.md, lineHeight: 18, marginBottom: Spacing.md },
  acceptedCard: { alignItems: 'center', marginBottom: 10 },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  acceptedText: { color: Colors.success, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  actionGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md,
  },
  actionTile: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
    borderRadius: Radius.item,
    paddingVertical: 20, alignItems: 'center', gap: 8,
  },
  actionTileLabel: { ...Typography.label, color: Colors.text.secondary },
  slotBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,107,0,0.08)',
    borderRadius: Radius.card, borderWidth: 1, borderColor: 'rgba(255,107,0,0.25)',
    padding: 12, marginBottom: Spacing.sm,
  },
  slotBannerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,107,0,0.12)',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  slotBannerTrade: { fontSize: 14, fontWeight: '700', color: '#FF6B00' },
  slotBannerDesc: { fontSize: 12, color: Colors.text.secondary, marginTop: 2, lineHeight: 16 },
  slotBannerCost: { fontSize: 13, fontWeight: '700', color: Colors.success, flexShrink: 0 },
});
