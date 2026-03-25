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
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, CardSkeleton } from '@/components/ui';

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

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(cents / 100);
}

export default function JobBriefScreen() {
  const route = useRoute<any>();
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [job, setJob] = useState<JobBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);

  useEffect(() => {
    const fetchJob = async () => {
      const { data } = await supabase
        .from('projects')
        .select(`
          id, address, city, room_type, status, ai_cost_min, ai_cost_max,
          ai_analysis, questionnaire_answers, dispatch_expires_at,
          materials ( item, quantity, unit, quality_tier ),
          scope_of_work ( phase, description, sort_order ),
          renders ( url, selected )
        `)
        .eq('id', projectId)
        .single();

      setJob(data as JobBrief);
      setAlreadyAccepted(data?.status !== 'dispatching');
      setLoading(false);
    };
    fetchJob();
  }, [projectId]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-job', {
        body: { project_id: projectId },
      });

      if (error) throw error;
      if (data?.code === 'JOB_FILLED') {
        Alert.alert('Job taken', 'Another contractor accepted this job just before you. Keep an eye out for the next one!');
        setAlreadyAccepted(true);
        return;
      }

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      Alert.alert('Job accepted!', 'The homeowner has been notified. Head to the project to start your quote.', [
        { text: 'View Project', onPress: () => navigation.navigate('QuoteBuilder') },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to accept job.';
      if (msg.includes('lock') || msg.includes('RACE')) {
        Alert.alert('Try again', 'Another contractor is claiming this job right now. Try tapping Accept again.');
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
              <Text style={styles.backText}>← Jobs</Text>
            </TouchableOpacity>
            <StatusBadge label={job.status} variant={job.status === 'dispatching' ? 'dispatching' : 'active'} dot />
          </View>

          {/* Hero render */}
          {selectedRender && (
            <Image source={{ uri: selectedRender.url }} style={styles.heroImage} resizeMode="cover" />
          )}

          <Text style={styles.roomType}>
            {job.room_type === 'kitchen' ? '🍳' : '🚿'} {job.room_type.charAt(0).toUpperCase() + job.room_type.slice(1)} Renovation
          </Text>
          <Text style={styles.address}>{job.address}</Text>

          {/* Cost estimate */}
          {job.ai_cost_min && job.ai_cost_max && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>AI Cost Estimate</Text>
              <Text style={styles.costRange}>
                {formatCad(job.ai_cost_min)} – {formatCad(job.ai_cost_max)}
              </Text>
              <Text style={styles.costNote}>Use as guidance for your quote</Text>
            </GlassCard>
          )}

          {/* AI Analysis summary */}
          {!!job.ai_analysis?.ai_observations && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>AI Analysis</Text>
              <Text style={styles.analysisText}>{String(job.ai_analysis.ai_observations)}</Text>
            </GlassCard>
          )}

          {/* Scope of work */}
          {job.scope_of_work && job.scope_of_work.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Scope of Work</Text>
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
            </GlassCard>
          )}

          {/* Materials */}
          {job.materials && job.materials.length > 0 && (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionLabel}>Materials</Text>
              {job.materials.map((mat, i) => (
                <View key={i} style={styles.matRow}>
                  <Text style={styles.matItem}>{mat.item}</Text>
                  <Text style={styles.matQty}>{mat.quantity} {mat.unit}</Text>
                </View>
              ))}
            </GlassCard>
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
                <Text style={styles.acceptedText}>✓ Job accepted</Text>
              </GlassCard>
              <View style={styles.actionGrid}>
                {[
                  { label: 'Quote', icon: '📄', route: 'quote-builder' },
                  { label: 'Milestones', icon: '🪜', route: 'milestones' },
                  { label: 'Messages', icon: '💬', route: 'messages' },
                  { label: 'Changes', icon: '📝', route: 'change-orders' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.route}
                    style={styles.actionTile}
                    onPress={() => navigation.navigate(item.route as any)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionTileIcon}>{item.icon}</Text>
                    <Text style={styles.actionTileLabel}>{item.label}</Text>
                  </TouchableOpacity>
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
  backText: { color: Colors.text.secondary, fontSize: 15 },
  heroImage: { width: '100%', height: 200, borderRadius: Radius.card, marginBottom: Spacing.md },
  roomType: { ...Typography.h2, textTransform: 'capitalize', marginBottom: 6 },
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
  actionTileIcon: { fontSize: 24 },
  actionTileLabel: { ...Typography.label, color: Colors.text.secondary },
});
