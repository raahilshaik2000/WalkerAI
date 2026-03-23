import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

interface BriefData {
  materials: Array<{
    item: string;
    quantity: number;
    unit: string;
    quality_tier: 'budget' | 'mid-range' | 'luxury';
  }>;
  scope_of_work: Array<{
    phase: string;
    description: string;
    sort_order: number;
  }>;
  ai_cost_min: number;
  ai_cost_max: number;
  permits: Array<{
    permit_type: string;
    required: boolean;
  }>;
  ai_observations: string;
}

function formatCad(cents: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const TIER_BADGE_VARIANT = {
  budget: 'neutral' as const,
  'mid-range': 'info' as const,
  luxury: 'warning' as const,
};

export default function BriefStep() {
  const navigation = useNavigation<any>();
  const {
    projectId,
    analysisResult,
    answers,
    selectedRenderId,
    address,
    province,
    photos,
  } = useProjectWizardStore();

  const [brief, setBrief] = useState<BriefData | null>(null);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const generateBrief = async () => {
      try {
        // Load selected render URL if available
        if (selectedRenderId) {
          const { data: render } = await supabase
            .from('renders')
            .select('url')
            .eq('id', selectedRenderId)
            .single();
          if (render) setRenderUrl(render.url);
        }

        const { data, error: briefError } = await supabase.functions.invoke(
          'generate-project-brief',
          {
            body: {
              project_id: projectId,
              analysis: analysisResult,
              questionnaire_answers: answers,
              selected_render_id: selectedRenderId,
              address,
              province,
            },
          }
        );
        if (briefError) throw briefError;
        setBrief(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate brief.');
      } finally {
        setLoading(false);
      }
    };

    generateBrief();
  }, []);

  const handleConfirm = () => {
    useProjectWizardStore.getState().setStep(7);
    navigation.navigate('Confirm');
  };

  if (loading) {
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingTitle}>Building your project brief…</Text>
            <Text style={styles.loadingSubtitle}>
              Claude is calculating materials, scope, and cost estimates
            </Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (error || !brief) {
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingCenter}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
            <Text style={styles.loadingTitle}>Brief generation failed</Text>
            <Text style={styles.loadingSubtitle}>{error}</Text>
            <GlassButton
              label="Retry"
              onPress={() => { setLoading(true); setError(null); }}
              style={{ marginTop: 24 }}
            />
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
        >
          {/* Progress */}
          <View style={styles.progressRow}>
            {Array.from({ length: 7 }, (_, i) => (
              <View
                key={i}
                style={[styles.progressSeg, i <= 5 && styles.progressSegActive]}
              />
            ))}
          </View>

          <Text style={styles.stepLabel}>STEP 6 OF 7</Text>
          <Text style={styles.title}>Your project brief</Text>
          <Text style={styles.subtitle}>Review the AI-generated plan before dispatching to contractors.</Text>

          {/* Hero render or photo */}
          {(renderUrl || photos[0]?.url) && (
            <Image
              source={{ uri: renderUrl ?? photos[0].url }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          )}

          {/* AI Observations */}
          {brief.ai_observations && (
            <GlassCard style={styles.section}>
              <Text style={styles.sectionTitle}>AI Observations</Text>
              <Text style={styles.obsText}>{brief.ai_observations}</Text>
            </GlassCard>
          )}

          {/* Cost Range */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>Estimated Cost</Text>
            <Text style={styles.costRange}>
              {formatCad(brief.ai_cost_min)} – {formatCad(brief.ai_cost_max)}
            </Text>
            <Text style={styles.costNote}>
              Final price set by your contractor's quote. This is an AI estimate.
            </Text>
          </GlassCard>

          {/* Scope of Work */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>Scope of Work</Text>
            {brief.scope_of_work.map((item, i) => (
              <View key={i} style={styles.scopeRow}>
                <View style={styles.scopePhaseTag}>
                  <Text style={styles.scopePhaseText}>{item.phase}</Text>
                </View>
                <Text style={styles.scopeDesc}>{item.description}</Text>
              </View>
            ))}
          </GlassCard>

          {/* Materials */}
          <GlassCard style={styles.section}>
            <Text style={styles.sectionTitle}>Materials</Text>
            {brief.materials.map((mat, i) => (
              <View key={i} style={styles.materialRow}>
                <Text style={styles.materialItem}>{mat.item}</Text>
                <View style={styles.materialRight}>
                  <Text style={styles.materialQty}>
                    {mat.quantity} {mat.unit}
                  </Text>
                  <StatusBadge
                    label={mat.quality_tier}
                    variant={TIER_BADGE_VARIANT[mat.quality_tier]}
                    size="sm"
                  />
                </View>
              </View>
            ))}
          </GlassCard>

          {/* Permits */}
          {brief.permits.length > 0 && (
            <GlassCard style={styles.section}>
              <Text style={styles.sectionTitle}>Required Permits</Text>
              {brief.permits.filter((p) => p.required).map((permit, i) => (
                <View key={i} style={styles.permitRow}>
                  <Text style={styles.permitIcon}>📋</Text>
                  <Text style={styles.permitType}>{permit.permit_type}</Text>
                </View>
              ))}
              {!brief.permits.some((p) => p.required) && (
                <Text style={styles.noPermits}>No permits required for this project.</Text>
              )}
            </GlassCard>
          )}

          <GlassButton
            label="Dispatch to Contractors"
            onPress={handleConfirm}
            fullWidth
            size="lg"
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  progressRow: { flexDirection: 'row', gap: 5, marginBottom: Spacing.lg },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.glass.surface },
  progressSegActive: { backgroundColor: Colors.accent },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.md, lineHeight: 22 },
  heroImage: {
    width: '100%',
    height: 220,
    borderRadius: Radius.card,
    marginBottom: Spacing.md,
  },
  section: { marginBottom: Spacing.md },
  sectionTitle: { ...Typography.h3, marginBottom: 12 },
  obsText: { ...Typography.bodySecondary, lineHeight: 22 },
  costRange: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.success,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  costNote: { ...Typography.caption, lineHeight: 18 },
  scopeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  scopePhaseTag: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 100,
  },
  scopePhaseText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  scopeDesc: { ...Typography.bodySecondary, flex: 1, lineHeight: 20 },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.glass.border,
  },
  materialItem: { ...Typography.body, flex: 1, marginRight: 8 },
  materialRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  materialQty: { ...Typography.caption },
  permitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  permitIcon: { fontSize: 18 },
  permitType: { ...Typography.body },
  noPermits: { ...Typography.bodySecondary },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: 16,
  },
  loadingTitle: { ...Typography.h2, textAlign: 'center' },
  loadingSubtitle: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  cta: {},
});
