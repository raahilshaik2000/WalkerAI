import { useCallback, useEffect, useState } from 'react';
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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, WizardHeader } from '@/components/ui';

const OPENAI_KEY = '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';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const CANADIAN_COST_RANGES: Record<string, Record<string, { min: number; max: number }>> = {
  ON: { kitchen: { min: 2500000, max: 7500000 }, bathroom: { min: 800000, max: 2500000 } },
  BC: { kitchen: { min: 2800000, max: 8500000 }, bathroom: { min: 900000, max: 2800000 } },
  AB: { kitchen: { min: 2200000, max: 6500000 }, bathroom: { min: 750000, max: 2200000 } },
  QC: { kitchen: { min: 2000000, max: 6000000 }, bathroom: { min: 700000, max: 2000000 } },
  MB: { kitchen: { min: 1800000, max: 5500000 }, bathroom: { min: 650000, max: 1800000 } },
  SK: { kitchen: { min: 1800000, max: 5000000 }, bathroom: { min: 600000, max: 1700000 } },
  NS: { kitchen: { min: 2000000, max: 5500000 }, bathroom: { min: 700000, max: 2000000 } },
  NB: { kitchen: { min: 1900000, max: 5000000 }, bathroom: { min: 650000, max: 1800000 } },
  NL: { kitchen: { min: 1900000, max: 5000000 }, bathroom: { min: 650000, max: 1800000 } },
  PE: { kitchen: { min: 1800000, max: 4500000 }, bathroom: { min: 600000, max: 1600000 } },
};
const DEFAULT_COST = { min: 2000000, max: 6000000 };

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

  const generateBrief = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (selectedRenderId) {
        const { data: render } = await supabase
          .from('renders')
          .select('url')
          .eq('id', selectedRenderId)
          .single();
        if (render) setRenderUrl(render.url);
      }

      const roomType = (analysisResult as any)?.room_type ?? 'kitchen';
      const provinceCode = (province ?? 'ON').toUpperCase();
      const costs = CANADIAN_COST_RANGES[provinceCode]?.[roomType] ??
        (roomType === 'kitchen' ? DEFAULT_COST : { min: 700000, max: 2000000 });

      const prompt = `Generate a detailed renovation project brief for a ${roomType} in ${provinceCode}, Canada.

Room Analysis: ${JSON.stringify(analysisResult)}
Homeowner Preferences (questionnaire answers): ${JSON.stringify(answers)}

Regional cost baseline (CAD cents): min=${costs.min}, max=${costs.max}

Return a valid JSON object with this exact structure:
{
  "materials": [
    { "item": "string", "quantity": number, "unit": "string", "quality_tier": "budget|mid-range|luxury" }
  ],
  "scope_of_work": [
    { "phase": "demolition|rough-in|installation|finishing", "description": "string", "sort_order": number }
  ],
  "ai_cost_min": number,
  "ai_cost_max": number,
  "permits": [
    { "permit_type": "string", "required": true }
  ],
  "ai_observations": "2-3 sentence summary for the homeowner"
}

Rules:
- ai_cost_min and ai_cost_max must be in CAD cents and within ±30% of regional baseline
- Adjust cost based on quality_tier preferences from questionnaire
- Include realistic Canadian permit requirements
- Materials should reflect the quality tier selected
- scope_of_work must cover all phases in order
- Return ONLY the JSON, no markdown`;

      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI request failed (${res.status}): ${errText}`);
      }

      const aiResponse = await res.json();
      const rawText: string = aiResponse.choices[0].message.content;
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      const briefData: BriefData = JSON.parse(cleaned);

      // Save to DB directly (bypasses edge function JWT issues)
      await Promise.all([
        supabase.from('projects').update({
          ai_cost_min: briefData.ai_cost_min,
          ai_cost_max: briefData.ai_cost_max,
          questionnaire_answers: answers,
        }).eq('id', projectId),
        briefData.materials.length > 0
          ? supabase.from('materials').insert(briefData.materials.map((m) => ({ ...m, project_id: projectId })))
          : Promise.resolve(),
        briefData.scope_of_work.length > 0
          ? supabase.from('scope_of_work').insert(briefData.scope_of_work.map((s) => ({ ...s, project_id: projectId })))
          : Promise.resolve(),
        briefData.permits.length > 0
          ? supabase.from('permits').insert(briefData.permits.map((p) => ({ project_id: projectId, permit_type: p.permit_type, status: 'not_applied' })))
          : Promise.resolve(),
      ]);

      setBrief(briefData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate brief.');
    } finally {
      setLoading(false);
    }
  }, [projectId, analysisResult, answers, selectedRenderId, address, province]);

  useEffect(() => {
    generateBrief();
  }, [generateBrief]);

  const handleConfirm = () => {
    useProjectWizardStore.getState().setStep(7);
    navigation.navigate('Address');
  };

  if (loading) {
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingTitle}>Building your project brief…</Text>
            <Text style={styles.loadingSubtitle}>
              WalkerAI is calculating materials, scope, and cost estimates
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
            <Ionicons name="warning-outline" size={48} color={Colors.warning} style={{ marginBottom: 16 }} />
            <Text style={styles.loadingTitle}>Brief generation failed</Text>
            <Text style={styles.loadingSubtitle}>{error}</Text>
            <GlassButton
              label="Retry"
              onPress={generateBrief}
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
          <WizardHeader currentStep={6} />

          <Text style={styles.stepLabel}>STEP 6 OF 8</Text>
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
                  <Ionicons name="document-text-outline" size={16} color={Colors.accent} style={styles.permitIcon} />
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
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 100,
  },
  scopePhaseText: {
    color: Colors.success,
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
