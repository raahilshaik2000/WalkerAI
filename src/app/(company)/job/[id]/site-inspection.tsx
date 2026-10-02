import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { formatSignedCadCents } from '@/lib/currency';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';
import type { SiteInspectionAdjustment } from '@/types/database.types';
import type { SiteInspectionReasonCategory } from '@/constants/enums';

const REASON_CATEGORIES: Array<{ key: SiteInspectionReasonCategory; label: string }> = [
  { key: 'plumbing_roughin_mismatch', label: 'Plumbing Rough-in Mismatch' },
  { key: 'subfloor_framing_damage', label: 'Subfloor / Structural Framing Damage' },
  { key: 'measurement_variance', label: 'Measurement / Dimensional Variance' },
  { key: 'electrical_service_upgrade', label: 'Electrical Service / Panel Upgrade' },
  { key: 'structural_obstacle', label: 'Structural Obstacle / Hidden Ducting' },
  { key: 'hazardous_material', label: 'Hazardous Material (Mold / Asbestos)' },
  { key: 'material_discontinuation', label: 'Material Specification Discontinued' },
  { key: 'other', label: 'Other Site Condition' },
];

export default function TradeSiteInspectionScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [adjustments, setAdjustments] = useState<SiteInspectionAdjustment[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [_loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [tradeType, _setTradeType] = useState('plumbing');
  const [category, setCategory] = useState<SiteInspectionReasonCategory>('plumbing_roughin_mismatch');
  const [description, setDescription] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [lengthFt, setLengthFt] = useState('');
  const [widthFt, setWidthFt] = useState('');
  const [ceilingFt, _setCeilingFt] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [laborRate, setLaborRate] = useState('95');
  const [materialCost, setMaterialCost] = useState('');
  const [scheduleImpactDays, setScheduleImpactDays] = useState('0');
  const [isCredit, setIsCredit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchAdjustments = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    if (!projectId || !user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data: comp } = await supabase
        .from('companies')
        .select('id, name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (comp) {
        setCompanyId(comp.id);
      }

      const { data, error } = await supabase
        .from('site_inspection_adjustments')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAdjustments((data ?? []) as SiteInspectionAdjustment[]);
      hasLoadedRef.current = true;
    } catch (err) {
      console.warn('Could not load site inspection adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, user?.id]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  // Compute total delta in cents
  const totalLaborCents = (parseFloat(laborHours) || 0) * (parseFloat(laborRate) || 0) * 100;
  const totalMaterialCents = (parseFloat(materialCost) || 0) * 100;
  const rawSubtotalCents = Math.round(totalLaborCents + totalMaterialCents);
  const computedDeltaCents = isCredit ? -rawSubtotalCents : rawSubtotalCents;

  async function handleSubmit() {
    if (!description.trim()) {
      Alert.alert('Required', 'Please enter a description explaining the site condition.');
      return;
    }
    if (!companyId) {
      Alert.alert('Error', 'No trade company found for your user account.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('submit-inspection-adjustment', {
        body: {
          project_id: projectId,
          company_id: companyId,
          trade_type: tradeType,
          reason_category: category,
          description: description.trim(),
          evidence_urls: evidenceUrl.trim() ? [evidenceUrl.trim()] : ['https://picsum.photos/800/600'],
          corrected_measurements: {
            lengthFt: lengthFt.trim() || undefined,
            widthFt: widthFt.trim() || undefined,
            ceilingHeightFt: ceilingFt.trim() || undefined,
          },
          labor_breakdown: laborHours ? [{
            task: `${category.replace(/_/g, ' ')} labour`,
            trade: tradeType,
            hours: parseFloat(laborHours),
            rateCadCents: Math.round((parseFloat(laborRate) || 0) * 100),
            totalCadCents: Math.round(totalLaborCents),
          }] : [],
          material_breakdown: materialCost ? [{
            item: `${category.replace(/_/g, ' ')} materials`,
            quantity: 1,
            unit: 'lot',
            unitCostCadCents: Math.round(totalMaterialCents),
            totalCadCents: Math.round(totalMaterialCents),
          }] : [],
          schedule_impact_days: parseInt(scheduleImpactDays, 10) || 0,
          cost_delta: computedDeltaCents,
        },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Submission failed');
      }

      Alert.alert(
        'Submitted for Head Office Review',
        'Your site inspection adjustment has been submitted. Walker AI Head Office will review your findings and evidence before any price adjustment is issued to the homeowner.',
      );

      setShowForm(false);
      setDescription('');
      setLaborHours('');
      setMaterialCost('');
      fetchAdjustments();
    } catch (err: unknown) {
      Alert.alert('Error', formatAppSafeErrorMessage(err, 'Failed to submit adjustment request.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Site Inspection</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Safeguard Notice */}
          <GlassCard style={styles.safeguardCard} padding={16}>
            <View style={styles.safeguardRow}>
              <Icon name="shield-check" size={22} color="#06B6D4" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.safeguardTitle}>Pre-Construction Safeguard</Text>
                <Text style={styles.safeguardBody}>
                  Trades cannot change project prices directly. Every adjustment must include verified evidence and is reviewed by Walker AI Head Office. Price increases require homeowner funding before work starts.
                </Text>
              </View>
            </View>
          </GlassCard>

          {!showForm ? (
            <GlassButton
              label="+ Request Inspection Adjustment"
              variant="primary"
              onPress={() => setShowForm(true)}
              style={styles.newBtn}
            />
          ) : (
            <GlassCard style={styles.formCard} padding={20}>
              <Text style={styles.formTitle}>New Site Inspection Adjustment</Text>

              <Text style={styles.fieldLabel}>Reason Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {REASON_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.chip, category === cat.key && styles.chipActive]}
                    onPress={() => setCategory(cat.key)}
                  >
                    <Text style={[styles.chipText, category === cat.key && styles.chipTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <GlassInput
                label="Description of Site Finding *"
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Existing cast-iron stack requires 2ft relocation to clear cabinet run"
                multiline
                numberOfLines={3}
              />

              <GlassInput
                label="Evidence Photo / Video URL"
                value={evidenceUrl}
                onChangeText={setEvidenceUrl}
                placeholder="https://... photo of site condition"
              />

              <Text style={styles.fieldLabel}>Corrected Measurements (Optional)</Text>
              <View style={styles.row}>
                <View style={styles.halfCol}>
                  <GlassInput label="Length (ft)" value={lengthFt} onChangeText={setLengthFt} placeholder="9.5" keyboardType="numeric" />
                </View>
                <View style={styles.halfCol}>
                  <GlassInput label="Width (ft)" value={widthFt} onChangeText={setWidthFt} placeholder="8.2" keyboardType="numeric" />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Itemized Labour & Materials</Text>
              <View style={styles.row}>
                <View style={styles.halfCol}>
                  <GlassInput label="Labour Hours" value={laborHours} onChangeText={setLaborHours} placeholder="4" keyboardType="numeric" />
                </View>
                <View style={styles.halfCol}>
                  <GlassInput label="Rate ($/hr)" value={laborRate} onChangeText={setLaborRate} placeholder="95" keyboardType="numeric" />
                </View>
              </View>

              <GlassInput label="Material Difference ($ CAD)" value={materialCost} onChangeText={setMaterialCost} placeholder="150" keyboardType="numeric" />

              <View style={styles.row}>
                <View style={styles.halfCol}>
                  <GlassInput label="Schedule Impact (Days)" value={scheduleImpactDays} onChangeText={setScheduleImpactDays} placeholder="0" keyboardType="numeric" />
                </View>
                <View style={styles.halfCol}>
                  <Text style={styles.subLabel}>Type</Text>
                  <TouchableOpacity
                    style={[styles.toggleBtn, isCredit ? styles.toggleCredit : styles.toggleIncrease]}
                    onPress={() => setIsCredit(!isCredit)}
                  >
                    <Text style={styles.toggleText}>{isCredit ? 'Credit / Decrease' : 'Price Increase'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.summaryBox}>
                <Text style={styles.summaryLabel}>Total Adjustment Requested:</Text>
                <Text style={[styles.summaryAmount, isCredit ? styles.greenText : styles.amberText]}>
                  {formatSignedCadCents(computedDeltaCents)}
                </Text>
              </View>

              <View style={styles.btnRow}>
                <GlassButton
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setShowForm(false)}
                  style={{ flex: 1, marginRight: 8 }}
                />
                <GlassButton
                  label={submitting ? 'Submitting...' : 'Submit to Head Office'}
                  variant="primary"
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={{ flex: 1, marginLeft: 8 }}
                />
              </View>
            </GlassCard>
          )}

          {/* List of Adjustments */}
          <Text style={styles.sectionTitle}>Inspection Adjustment History</Text>
          {adjustments.length === 0 ? (
            <GlassCard style={styles.emptyCard} padding={20}>
              <Text style={styles.emptyText}>No inspection adjustments submitted for this job.</Text>
            </GlassCard>
          ) : (
            adjustments.map((adj) => (
              <GlassCard key={adj.id} style={styles.adjCard} padding={16}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.adjCat}>{adj.reason_category.replace(/_/g, ' ').toUpperCase()}</Text>
                    <Text style={styles.adjDesc}>{adj.description}</Text>
                  </View>
                  <StatusBadge
                    variant={adj.status === 'approved_and_funded' || adj.status === 'credited' ? 'completed' : adj.status.includes('reject') ? 'error' : 'pending'}
                    label={adj.status.replace(/_/g, ' ')}
                  />
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Price Delta:</Text>
                  <Text style={[styles.detailValue, adj.cost_delta >= 0 ? styles.amberText : styles.greenText]}>
                    {formatSignedCadCents(adj.cost_delta)}
                  </Text>
                </View>

                {adj.schedule_impact_days !== 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Schedule Impact:</Text>
                    <Text style={styles.detailValue}>{adj.schedule_impact_days > 0 ? `+${adj.schedule_impact_days}` : adj.schedule_impact_days} days</Text>
                  </View>
                )}

                {adj.head_office_notes ? (
                  <View style={styles.notesBox}>
                    <Text style={styles.notesTitle}>Head Office Note:</Text>
                    <Text style={styles.notesBody}>{adj.head_office_notes}</Text>
                  </View>
                ) : null}
              </GlassCard>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: { padding: 4 },
  title: { ...Typography.h2, color: Colors.text.primary },
  scroll: { padding: Spacing.md, paddingBottom: 40 },
  safeguardCard: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderColor: 'rgba(6, 182, 212, 0.3)',
    marginBottom: Spacing.md,
  },
  safeguardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  safeguardTitle: { ...Typography.h3, color: '#06B6D4', marginBottom: 4 },
  safeguardBody: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 18 },
  newBtn: { marginBottom: Spacing.md },
  formCard: { marginBottom: Spacing.lg },
  formTitle: { ...Typography.h3, color: Colors.text.primary, marginBottom: Spacing.sm },
  fieldLabel: { ...Typography.label, color: Colors.text.primary, marginTop: Spacing.sm, marginBottom: 6 },
  subLabel: { ...Typography.caption, color: Colors.text.secondary, marginBottom: 4 },
  chipRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#FF6B00',
    borderColor: '#FF6B00',
  },
  chipText: { ...Typography.caption, color: Colors.text.secondary },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },
  textInput: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  halfCol: { flex: 0.48 },
  toggleBtn: {
    height: 48,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  toggleIncrease: { backgroundColor: 'rgba(255, 107, 0, 0.15)', borderColor: '#FF6B00' },
  toggleCredit: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981' },
  toggleText: { ...Typography.label, color: Colors.text.primary },
  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 14,
    borderRadius: Radius.md,
    marginVertical: Spacing.md,
  },
  summaryLabel: { ...Typography.label, color: Colors.text.secondary },
  summaryAmount: { ...Typography.h2 },
  amberText: { color: '#FF6B00' },
  greenText: { color: '#10B981' },
  btnRow: { flexDirection: 'row', marginTop: Spacing.xs },
  sectionTitle: { ...Typography.h3, color: Colors.text.primary, marginBottom: Spacing.sm },
  emptyCard: { alignItems: 'center' },
  emptyText: { ...Typography.caption, color: Colors.text.secondary },
  adjCard: { marginBottom: Spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  adjCat: { ...Typography.caption, color: '#FF6B00', fontWeight: '700', marginBottom: 2 },
  adjDesc: { ...Typography.body, color: Colors.text.primary },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  detailLabel: { ...Typography.caption, color: Colors.text.secondary },
  detailValue: { ...Typography.caption, fontWeight: '600', color: Colors.text.primary },
  notesBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.sm,
  },
  notesTitle: { ...Typography.caption, color: Colors.text.secondary, fontWeight: '700' },
  notesBody: { ...Typography.caption, color: Colors.text.primary, marginTop: 2 },
});
