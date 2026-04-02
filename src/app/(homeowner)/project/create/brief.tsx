import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, WizardHeader } from '@/components/ui';
import { buildPricingPromptSection, calculateQuantities, estimateProjectCost } from '@/data/pricing-reference';
import { getQuestionsForRoomType, extractQualityTier, buildAnswerSummary } from '@/data/fixed-questions';

const OPENAI_KEY = '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';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

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
  confidence_score?: number;
  confidence_notes?: string;
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
    materialOverrides,
    measurements,
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

      // Resolve quality tier and human-readable answer summary from fixed questions
      const qualityTier = extractQualityTier(answers);
      const fixedQuestions = getQuestionsForRoomType(roomType);
      const answerSummary = buildAnswerSummary(fixedQuestions, answers);

      // Pre-calculate room quantities from homeowner measurements
      const quantities = measurements ? calculateQuantities({
        lengthFt: measurements.lengthFt,
        widthFt: measurements.widthFt,
        ceilingHeightFt: measurements.ceilingHeightFt,
        numDoors: measurements.numDoors,
        numWindows: measurements.numWindows,
        upperLinearFt: measurements.upperLinearFt,
        lowerLinearFt: measurements.lowerLinearFt,
        countertopLinearFt: measurements.countertopLinearFt,
      }) : null;

      // Calculate cost directly from Walker AI pricing data — do NOT let AI guess this
      const costEstimate = estimateProjectCost({
        roomType: roomType as 'kitchen' | 'bathroom',
        qualityTier,
        answers,
        quantities,
      });

      const quantitiesNote = quantities
        ? `\nPre-calculated quantities from homeowner measurements (use these for line-item takeoffs):
- Floor area: ${quantities.floor_area_sqf} sqf
- Wall area (net): ${quantities.wall_area_net_sqf} sqf (gross: ${quantities.wall_area_gross_sqf} sqf)
- Ceiling area: ${quantities.ceiling_area_sqf} sqf
- Perimeter: ${quantities.perimeter_lf} LF
- Baseboard: ${quantities.baseboard_lf} LF
- Door/window casing: ${quantities.casing_lf} LF
- Floor tile (with waste): ${quantities.floor_tile_sqf} sqf
- Upper cabinet run: ${quantities.upper_cabinet_lf} LF
- Lower cabinet run: ${quantities.lower_cabinet_lf} LF
- Countertop: ${quantities.countertop_lf} LF\n`
        : '';

      const materialsTarget = roomType === 'kitchen' ? '18–25' : '12–18';
      const costLinesSummary = costEstimate.lineItems
        .map(l => `  - ${l.label}: $${l.avgCad.toLocaleString()}`)
        .join('\n');

      const prompt = `Generate a comprehensive renovation project brief for a ${roomType} renovation in ${provinceCode}, Canada.

=== ROOM ANALYSIS (from AI photo scan) ===
${JSON.stringify(analysisResult, null, 2)}

=== HOMEOWNER SELECTIONS ===
${answerSummary}

=== QUALITY TIER: ${qualityTier.toUpperCase()} ===
The homeowner selected "${qualityTier}" quality. ALL materials must be "${qualityTier}" grade.
${quantitiesNote}
=== PRE-CALCULATED COST (from Walker AI Pricing Engine — DO NOT CHANGE THESE NUMBERS) ===
The Walker AI Pricing Engine has already computed the cost from the official pricing reference:
${costLinesSummary}
TOTAL AVERAGE: $${costEstimate.avgDollars.toLocaleString()} CAD
ai_cost_min (use this exact value): ${costEstimate.min}
ai_cost_max (use this exact value): ${costEstimate.max}

You MUST use ai_cost_min: ${costEstimate.min} and ai_cost_max: ${costEstimate.max} in your response.
Do NOT recalculate costs. Do NOT substitute your own numbers. The pricing engine is authoritative.

Return a valid JSON object — no markdown, no explanation, just the JSON:
{
  "materials": [
    { "item": "string", "quantity": number, "unit": "string", "quality_tier": "${qualityTier}" }
  ],
  "scope_of_work": [
    { "phase": "demolition|rough-in|installation|finishing", "description": "string", "sort_order": number }
  ],
  "ai_cost_min": ${costEstimate.min},
  "ai_cost_max": ${costEstimate.max},
  "permits": [
    { "permit_type": "string", "required": true }
  ],
  "ai_observations": "2-3 sentence summary for the homeowner",
  "confidence_score": number,
  "confidence_notes": "string"
}

RULES:
1. ai_cost_min and ai_cost_max: copy the exact values above (${costEstimate.min} and ${costEstimate.max}). Do not change them.
2. QUALITY TIER: All materials MUST use quality_tier: "${qualityTier}". For luxury: name premium brands (Thermador, Sub-Zero, Caesarstone, Kohler Artifacts, Wolf). For budget: name stock-grade products. For mid-range: semi-custom grades.
3. MATERIALS LIST: Include ${materialsTarget} line items matching the cost breakdown above. Include cabinets (upper + lower), countertops, backsplash tile, flooring, drywall repair, paint (walls + ceiling), plumbing fixtures, electrical fixtures, hardware, trim/baseboard, disposal. Add appliances if homeowner selected replacement.
4. SCOPE: Cover all phases in logical order (demolition → rough-in → installation → finishing).
5. PERMITS: List realistic Ontario Building Code permit requirements.
6. CONFIDENCE: Start at 90, deduct for structural changes (-15), drain relocation (-12), no measurements provided (-8), pre-1980 home (-10). Minimum 30.
7. Return ONLY the JSON.`;

      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 6000,
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

      // Always use the TypeScript-computed costs (authoritative) — don't trust AI-generated costs
      briefData.ai_cost_min = costEstimate.min;
      briefData.ai_cost_max = costEstimate.max;

      // Save to DB directly (bypasses edge function JWT issues)
      await Promise.all([
        supabase.from('projects').update({
          ai_cost_min: briefData.ai_cost_min,
          ai_cost_max: briefData.ai_cost_max,
          questionnaire_answers: answers,
          ...(briefData.confidence_score != null ? { ai_confidence_score: briefData.confidence_score } : {}),
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
  }, [projectId, analysisResult, answers, selectedRenderId, address, province, measurements]);

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
              AI estimate (±8%) · exact price confirmed by contractor quote
            </Text>
            {brief.confidence_score != null && (
              <View style={styles.confidenceRow}>
                <View style={[
                  styles.confidenceBadge,
                  brief.confidence_score >= 80
                    ? styles.confidenceHigh
                    : brief.confidence_score >= 60
                    ? styles.confidenceMid
                    : styles.confidenceLow,
                ]}>
                  <Text style={styles.confidenceScore}>{brief.confidence_score}%</Text>
                  <Text style={styles.confidenceLabel}>estimate confidence</Text>
                </View>
                {brief.confidence_notes ? (
                  <Text style={styles.confidenceNotes}>{brief.confidence_notes}</Text>
                ) : null}
              </View>
            )}
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
            <View style={styles.materialHeader}>
              <Text style={styles.sectionTitle}>Materials</Text>
              <Text style={styles.materialHint}>Tap to add details</Text>
            </View>
            {brief.materials.map((mat, i) => {
              const override = materialOverrides[i];
              const activeTier = override?.quality_tier ?? mat.quality_tier;
              const hasDetails = override && (override.brand_preference || override.color_finish || override.specific_model || override.contractor_notes);
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.materialRow}
                  onPress={() => navigation.navigate('MaterialDetail', {
                    materialIndex: i,
                    materialName: mat.item,
                    quantity: mat.quantity,
                    unit: mat.unit,
                  })}
                  activeOpacity={0.7}
                >
                  <View style={styles.materialLeft}>
                    <Text style={styles.materialItem}>{mat.item}</Text>
                    {hasDetails && (
                      <View style={styles.detailsRow}>
                        {override.brand_preference ? <Text style={styles.detailChip}>{override.brand_preference}</Text> : null}
                        {override.color_finish ? <Text style={styles.detailChip}>{override.color_finish}</Text> : null}
                      </View>
                    )}
                  </View>
                  <View style={styles.materialRight}>
                    <Text style={styles.materialQty}>{mat.quantity} {mat.unit}</Text>
                    <StatusBadge label={activeTier} variant={TIER_BADGE_VARIANT[activeTier]} size="sm" />
                    <Ionicons name="chevron-forward" size={14} color={Colors.text.tertiary} />
                  </View>
                </TouchableOpacity>
              );
            })}
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
  costNote: { ...Typography.caption, lineHeight: 18, marginBottom: 10 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  confidenceBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 70,
  },
  confidenceHigh: { backgroundColor: 'rgba(52, 199, 89, 0.15)', borderWidth: 1, borderColor: 'rgba(52, 199, 89, 0.3)' },
  confidenceMid:  { backgroundColor: 'rgba(255, 159, 10, 0.15)', borderWidth: 1, borderColor: 'rgba(255, 159, 10, 0.3)' },
  confidenceLow:  { backgroundColor: 'rgba(255, 69, 58, 0.15)',  borderWidth: 1, borderColor: 'rgba(255, 69, 58, 0.3)'  },
  confidenceScore: { fontSize: 18, fontWeight: '700', color: Colors.text.primary },
  confidenceLabel: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.4 },
  confidenceNotes: { ...Typography.caption, flex: 1, lineHeight: 18, color: Colors.text.secondary },
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
  materialHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  materialHint: { fontSize: 12, color: Colors.text.tertiary, fontStyle: 'italic' },
  materialLeft: { flex: 1, marginRight: 8 },
  materialItem: { ...Typography.body },
  detailsRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  detailChip: { fontSize: 11, color: Colors.accent, backgroundColor: 'rgba(255,107,0,0.1)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
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
