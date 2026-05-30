import { useEffect, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, CardSkeleton } from '@/components/ui';
import { formatStatusLabel, formatCad } from '@/lib/formatters';
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
}

interface JobBrief {
  id: string;
  address: string;
  city: string;
  room_type: string;
  status: string;
  ai_cost_min: number | null;
  ai_cost_max: number | null;
  ai_analysis: Record<string, unknown> | null;
  questionnaire_answers: Record<string, string> | null;
  materials: Array<{ item: string; quantity: number; unit: string; quality_tier: string }>;
  scope_of_work: Array<{ phase: string; description: string; sort_order: number }>;
  renders: Array<{ url: string; selected: boolean }>;
  dispatch_expires_at: string | null;
}

export default function JobBriefScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const slotId: string | undefined = route.params?.slot;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [job, setJob] = useState<JobBrief | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [hasStripe, setHasStripe] = useState(false);

  useEffect(() => {
    const fetchJob = async () => {
      const [{ data: projectData }, { data: slotData }, { data: companyData }] = await Promise.all([
        supabase
          .from('projects')
          .select(`
            id, address, city, room_type, status, ai_cost_min, ai_cost_max,
            ai_analysis, questionnaire_answers, dispatch_expires_at,
            materials ( item, quantity, unit, quality_tier ),
            scope_of_work ( phase, description, sort_order ),
            renders ( url, selected )
          `)
          .eq('id', projectId)
          .single(),
        slotId
          ? supabase
              .from('project_slots')
              .select('id, trade_type, description, estimated_cost_min, estimated_cost_max, status')
              .eq('id', slotId)
              .single()
          : Promise.resolve({ data: null }),
        supabase
          .from('companies')
          .select('stripe_account_id')
          .eq('user_id', user?.id)
          .single(),
      ]);

      setJob(projectData as JobBrief);
      if (slotData) setSlot(slotData as Slot);
      setHasStripe(!!companyData?.stripe_account_id);
      // Already accepted if the slot is filled OR project is past dispatching
      const slotFilled = slotData ? (slotData as Slot).status === 'filled' || (slotData as Slot).status === 'scheduled' : false;
      setAlreadyAccepted(slotFilled || projectData?.status !== 'dispatching');
      setLoading(false);
    };
    fetchJob();
  }, [projectId, slotId]);

  const handleAccept = async () => {
    if (!hasStripe) {
      Alert.alert(
        'Set up payouts first',
        'You need to connect your bank account before accepting jobs. Set up Stripe payouts in your profile.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Set up Payouts', onPress: () => navigation.navigate('CompanyTabs', { screen: 'Profile' }) },
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

      if (error) throw error;

      if (data?.code === 'SLOT_FILLED' || data?.code === 'JOB_FILLED') {
        Alert.alert('Slot taken', 'Another contractor claimed this slot just before you. Keep an eye out for the next one!');
        setAlreadyAccepted(true);
        return;
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setAlreadyAccepted(true);
      Alert.alert(
        slotId ? 'Slot accepted!' : 'Job accepted!',
        'The homeowner has been notified. Verify material quantities and await schedule confirmation.',
        [{ text: 'Verify Materials', onPress: () => navigation.navigate('JobMaterials', { id: projectId }) }]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to accept job.';
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
            <Text style={Typography.h2}>Job not found</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const selectedRender = job.renders?.find((r) => r.selected);

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
          {!alreadyAccepted ? (
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
          ) : job.status !== 'dispatching' ? (
            <>
              <GlassCard style={[styles.card, styles.acceptedCard]}>
                <View style={styles.acceptedRow}>
                  <Icon name="check-circle" size={18} color={Colors.success} />
                  <Text style={styles.acceptedText}>Job accepted</Text>
                </View>
              </GlassCard>
              <View style={styles.actionGrid}>
                {[
                  { label: 'Payments', iconName: 'cash-multiple', route: 'JobMilestones', meta: 'Milestones' },
                  { label: 'Materials', iconName: 'cube-outline', route: 'JobMaterials', meta: 'Verify counts' },
                  { label: 'Messages', iconName: 'chat-outline', route: 'JobMessages', meta: 'Project thread' },
                  { label: 'Changes', iconName: 'pencil-outline', route: 'JobChangeOrders', meta: 'Change orders' },
                ].map((item) => (
                  <TradeActionTile
                    key={item.route}
                    label={item.label}
                    icon={item.iconName}
                    meta={item.meta}
                    onPress={() => navigation.navigate(item.route as any, { id: projectId })}
                  />
                ))}
              </View>
            </>
          ) : (
            <GlassCard style={[styles.card, styles.acceptedCard]}>
              <Text style={styles.acceptedText}>Job no longer available</Text>
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
