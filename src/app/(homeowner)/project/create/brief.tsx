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
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography, Radius } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, StatusBadge, WizardHeader } from '@/components/ui';
import { calculateEstimateConfidence, calculateQuantities, estimateProjectCost } from '@/data/pricing-reference';
import { getQuestionsForRoomType, extractQualityTier, buildAnswerSummary } from '@/data/fixed-questions';
import { normalizeCanadianProvince } from '@/lib/canada';
import { parseMetricDimension } from '@/lib/measurements';
import {
  answersWithSurfaceSelections,
  buildSurfaceSelectionSummary,
  projectAnswersWithSurfaceSelections,
} from '@/lib/room-customizer';


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

type QuantityEstimate = ReturnType<typeof calculateQuantities>;

function isMissingColumnError(message?: string | null) {
  if (!message) return false;
  // Postgres returns "column ... does not exist". PostgREST wraps the same
  // condition as "Could not find the '<col>' column of '<table>' in the
  // schema cache". We need to swallow both so optional schema-add fields
  // (like ai_confidence_score) don't surface as hard failures when the
  // migration hasn't been applied yet.
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
}

function positiveMeasurement(value?: string | null) {
  return parseMetricDimension(String(value ?? '')) != null;
}

function measuredQuantityLines(quantities: QuantityEstimate | null) {
  if (!quantities) return [];

  return [
    ['Floor area', quantities.floor_area_sqf, 'sqf'],
    ['Wall area (net)', quantities.wall_area_net_sqf, 'sqf'],
    ['Wall area (gross)', quantities.wall_area_gross_sqf, 'sqf'],
    ['Ceiling area', quantities.ceiling_area_sqf, 'sqf'],
    ['Perimeter', quantities.perimeter_lf, 'LF'],
    ['Baseboard', quantities.baseboard_lf, 'LF'],
    ['Door/window casing', quantities.casing_lf, 'LF'],
    ['Floor tile (with waste)', quantities.floor_tile_sqf, 'sqf'],
    ['Upper cabinet run', quantities.upper_cabinet_lf, 'LF'],
    ['Lower cabinet run', quantities.lower_cabinet_lf, 'LF'],
    ['Countertop', quantities.countertop_lf, 'LF'],
  ] as Array<[string, number, string]>;
}

export default function BriefStep() {
  const navigation = useNavigation<any>();
  const {
    projectId,
    analysisResult,
    answers,
    selectedRenderId,
    province,
    photos,
    materialOverrides,
    surfaceSelections,
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
      if (!projectId) {
        throw new Error('Project is missing. Go back and complete photo analysis before generating a brief.');
      }

      if (selectedRenderId) {
        const { data: render, error: renderError } = await supabase
          .from('renders')
          .select('url')
          .eq('id', selectedRenderId)
          .maybeSingle();
        if (renderError) throw new Error(`Selected render could not be loaded: ${renderError.message}`);
        if (!render) throw new Error('Selected render could not be found.');
        if (render) setRenderUrl(render.url);
      }

      const roomType = (analysisResult as any)?.room_type ?? 'kitchen';
      const pricingAnswers = answersWithSurfaceSelections(answers, roomType, surfaceSelections);
      const persistedAnswers = projectAnswersWithSurfaceSelections(answers, roomType, surfaceSelections);
      const finishSummary = buildSurfaceSelectionSummary(roomType, surfaceSelections, pricingAnswers);
      const provinceCode = normalizeCanadianProvince(province);
      if (!provinceCode) {
        throw new Error('Project province is missing. Add the project address before generating the brief.');
      }

      // Resolve quality tier and human-readable answer summary from fixed questions
      const qualityTier = extractQualityTier(pricingAnswers);
      const fixedQuestions = getQuestionsForRoomType(roomType);
      const answerSummary = buildAnswerSummary(fixedQuestions, pricingAnswers);

      const hasAnyNumericMeasurement = measurements
        ? Object.values(measurements).some((value) => typeof value === 'string' && positiveMeasurement(value))
        : false;
      const hasCoreRoomMeasurements = !!measurements
        && positiveMeasurement(measurements.lengthFt)
        && positiveMeasurement(measurements.widthFt);

      // Pre-calculate room quantities from homeowner measurements when at least
      // one numeric field was actually entered. Boolean toggles alone are not a takeoff.
      const quantities = measurements && hasAnyNumericMeasurement ? calculateQuantities({
        lengthFt: measurements.lengthFt,
        widthFt: measurements.widthFt,
        ceilingHeightFt: measurements.ceilingHeightFt,
        numDoors: measurements.numDoors,
        numWindows: measurements.numWindows,
        upperLinearFt: measurements.upperLinearFt,
        lowerLinearFt: measurements.lowerLinearFt,
        countertopLinearFt: measurements.countertopLinearFt,
        showerLengthFt: measurements.showerLength,
        showerWidthFt: measurements.showerWidth,
        doorWidthFt: measurements.doorWidth,
        doorHeightFt: measurements.doorHeight,
        windowWidthFt: measurements.windowWidth,
        windowHeightFt: measurements.windowHeight,
        floorTileAreaSqf: measurements.floorTileArea,
        wallTileAreaSqf: measurements.wallTileArea,
      }) : null;
      const quantityLines = measuredQuantityLines(quantities)
        .filter(([, value]) => Number.isFinite(value) && value > 0)
        .map(([label, value, unit]) => `- ${label}: ${value} ${unit}`);

      // Calculate cost directly from Walker AI pricing data — do NOT let AI guess this
      const costEstimate = estimateProjectCost({
        roomType: roomType as 'kitchen' | 'bathroom',
        qualityTier,
        answers: pricingAnswers,
        quantities,
        provinceCode,
      });
      const confidenceEstimate = calculateEstimateConfidence({
        roomType: roomType as 'kitchen' | 'bathroom',
        answers: pricingAnswers,
        hasMeasurements: hasCoreRoomMeasurements,
        analysisResult,
      });

      const quantitiesNote = quantityLines.length > 0
        ? `\nAvailable measured quantities from homeowner input (use only these positive values for line-item takeoffs; use defaults for missing quantities):\n${quantityLines.join('\n')}\n`
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

=== FINISH CUSTOMIZER SELECTIONS ===
${finishSummary}

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
  "confidence_score": ${confidenceEstimate.score},
  "confidence_notes": ${JSON.stringify(confidenceEstimate.notes)}
}

RULES:
1. ai_cost_min and ai_cost_max: copy the exact values above (${costEstimate.min} and ${costEstimate.max}). Do not change them.
2. QUALITY TIER: All materials MUST use quality_tier: "${qualityTier}". For luxury: name premium brands (Thermador, Sub-Zero, Caesarstone, Kohler Artifacts, Wolf). For budget: name stock-grade products. For mid-range: semi-custom grades.
3. MATERIALS LIST: Include ${materialsTarget} line items that match the cost breakdown above and the finish customizer selections. Treat "Homeowner selected" and "From questionnaire" finishes as homeowner intent; treat "Preview default" finishes only as visual placeholders. Do not add cabinets, countertops, backsplash, flooring, appliances, demolition, or other work the homeowner selected to keep unless the pricing engine cost breakdown includes that line. Add appliances only if homeowner selected replacement.
4. SCOPE: Cover all phases in logical order (demolition → rough-in → installation → finishing).
5. PERMITS: List realistic local Canadian permit requirements for ${provinceCode}. Mention Ontario Building Code only when the project province is ON; otherwise use the local authority having jurisdiction for that province/municipality.
6. CONFIDENCE: copy confidence_score ${confidenceEstimate.score} and confidence_notes ${JSON.stringify(confidenceEstimate.notes)}. Do not recalculate confidence.
7. Return ONLY the JSON.`;

      // Route through edge function — API key stays server-side, DB writes handled there
      const { data: briefResponse, error: briefError } = await supabase.functions.invoke('generate-project-brief', {
        body: {
          project_id: projectId,
          questionnaire_answers: persistedAnswers,
          province,
          custom_prompt: prompt,
          forced_cost_min: costEstimate.min,
          forced_cost_max: costEstimate.max,
        },
      });

      if (briefError) throw new Error(`Brief generation failed: ${await formatSupabaseFunctionError(briefError)}`);
      if (!briefResponse?.materials) throw new Error('Invalid response from brief generator.');

      const briefData: BriefData = {
        ...briefResponse,
        ai_cost_min: costEstimate.min,
        ai_cost_max: costEstimate.max,
        confidence_score: confidenceEstimate.score,
        confidence_notes: confidenceEstimate.notes,
      };

      // Persist confidence score if present (edge function doesn't handle this field)
      if (briefData.confidence_score != null) {
        const { error: confidenceError } = await supabase.from('projects')
          .update({ ai_confidence_score: briefData.confidence_score })
          .eq('id', projectId);
        if (confidenceError && !isMissingColumnError(confidenceError.message)) {
          throw new Error(`Brief saved but confidence score update failed: ${confidenceError.message}`);
        }
      }

      setBrief(briefData);
    } catch (err) {
      setError(formatAppSafeErrorMessage(err, 'Failed to generate brief.'));
    } finally {
      setLoading(false);
    }
  }, [projectId, analysisResult, answers, selectedRenderId, province, measurements, surfaceSelections]);

  useEffect(() => {
    generateBrief();
  }, [generateBrief]);

  const handleConfirm = async () => {
    if (!projectId) {
      setError('Project is missing. Go back and complete photo analysis before dispatching.');
      return;
    }

    try {
      const updates = Object.entries(materialOverrides);
      for (const [index, override] of updates) {
        const sortOrder = Number(index);
        const payload = {
          quality_tier: override.quality_tier,
          brand_preference: override.brand_preference ?? null,
          color_finish: override.color_finish ?? null,
          specific_model: override.specific_model ?? null,
          contractor_notes: override.contractor_notes ?? null,
        };

        const { data, error: updateError } = await supabase
          .from('materials')
          .update(payload)
          .eq('project_id', projectId)
          .eq('sort_order', sortOrder)
          .select('id')
          .maybeSingle();
        if (updateError) {
          if (isMissingColumnError(updateError.message)) continue;
          throw new Error(`Could not save ${brief?.materials[sortOrder]?.item ?? 'material'} details: ${updateError.message}`);
        }
        if (!data) {
          throw new Error(`Could not save ${brief?.materials[sortOrder]?.item ?? 'material'} details because the material row is no longer available.`);
        }
      }

      useProjectWizardStore.getState().setStep(8);
      navigation.navigate('Confirm');
    } catch (err) {
      setError(formatAppSafeErrorMessage(err, 'Failed to save material details.'));
    }
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
    const needsAddress = /province is missing|address/i.test(error ?? '');
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingCenter}>
            <Ionicons name="warning-outline" size={48} color={Colors.warning} style={{ marginBottom: 16 }} />
            <Text style={styles.loadingTitle}>Brief generation failed</Text>
            <Text style={styles.loadingSubtitle}>{error}</Text>
            <GlassButton
              label={needsAddress ? 'Add Address' : 'Retry'}
              onPress={needsAddress ? () => navigation.navigate('Address') : generateBrief}
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
          <WizardHeader currentStep={7} />

          <Text style={styles.stepLabel}>STEP 7 OF 8</Text>
          <Text style={styles.title}>Your project brief</Text>
          <Text style={styles.subtitle}>Review the measured scope, materials, permits, and pricing before dispatching to contractors.</Text>

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
              Pricing engine estimate · exact price confirmed by contractor quote
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
                    materialQualityTier: activeTier,
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
            label="Continue to Dispatch"
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
