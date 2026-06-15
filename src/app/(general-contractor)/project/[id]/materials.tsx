import { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { formatCadCents, parsePositiveCadToCents, parseSignedCadToCents } from '@/lib/currency';
import { formatStatusLabel } from '@/lib/formatters';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';

interface Material {
  id: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  quality_tier: string | null;
  brand_preference: string | null;
  color_finish: string | null;
  specific_model: string | null;
  contractor_notes: string | null;
}

interface MaterialOrder {
  id: string;
  material_id: string;
  status: string;
  final_price: number | null;
  offered_price: number | null;
  accepted_supplier?: { business_name: string | null } | Array<{ business_name: string | null }> | null;
}

interface Assignment {
  id: string;
  status: string;
  homeowner_id: string;
  general_contractor_id: string;
}

function supplierName(order: MaterialOrder) {
  const supplier = Array.isArray(order.accepted_supplier) ? order.accepted_supplier[0] : order.accepted_supplier;
  return supplier?.business_name ?? null;
}

function formatQuantity(material: Material) {
  const qty = material.quantity == null ? 'TBD' : String(material.quantity);
  return `${qty}${material.unit ? ` ${material.unit}` : ''}`;
}

export default function GeneralContractorMaterialsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [orders, setOrders] = useState<MaterialOrder[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [productName, setProductName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [colorFinish, setColorFinish] = useState('');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [costDelta, setCostDelta] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const currentUser = (await supabase.auth.getUser()).data.user;
    if (!currentUser?.id) {
      setErrorMessage('You need to be signed in to source materials.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const { data: gc, error: gcError } = await supabase
        .from('general_contractors')
        .select('id')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');

      const [assignmentResult, materialsResult, ordersResult] = await Promise.all([
        supabase
          .from('general_contractor_projects')
          .select('id, status, homeowner_id, general_contractor_id')
          .eq('project_id', projectId)
          .eq('general_contractor_id', gc.id)
          .maybeSingle(),
        supabase
          .from('materials')
          .select('id, item, quantity, unit, quality_tier, brand_preference, color_finish, specific_model, contractor_notes')
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('item'),
        supabase
          .from('material_orders')
          .select('id, material_id, status, final_price, offered_price, accepted_supplier:suppliers!accepted_supplier_id(business_name)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);
      if (assignmentResult.error) throw assignmentResult.error;
      if (materialsResult.error) throw materialsResult.error;
      if (ordersResult.error) throw ordersResult.error;

      setAssignment(assignmentResult.data as Assignment | null);
      setMaterials((materialsResult.data ?? []) as Material[]);
      setOrders((ordersResult.data ?? []) as MaterialOrder[]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load materials.');
      setAssignment(null);
      setMaterials([]);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const selectMaterial = (material: Material) => {
    setSelectedMaterialId(material.id);
    setProductName(material.specific_model ?? '');
    setSupplier(material.brand_preference ?? '');
    setColorFinish(material.color_finish ?? '');
    setQuotedPrice('');
    setCostDelta('');
    setLeadTimeDays('');
    setQuoteNote('');
  };

  const handleSubmit = async () => {
    if (!assignment || assignment.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before material recommendations can be sent.');
      return;
    }
    const material = materials.find((m) => m.id === selectedMaterialId);
    if (!material) {
      Alert.alert('Material required', 'Choose the material you want to recommend replacing.');
      return;
    }
    if (!productName.trim()) {
      Alert.alert('Product required', 'Enter the replacement product or finish recommendation.');
      return;
    }
    const quotedPriceCents = quotedPrice.trim() ? parsePositiveCadToCents(quotedPrice) : null;
    if (quotedPrice.trim() && quotedPriceCents == null) {
      Alert.alert('Invalid quote', 'Enter the supplier quote as a valid CAD amount.');
      return;
    }
    const costDeltaCents = costDelta.trim() ? parseSignedCadToCents(costDelta) : null;
    if (costDelta.trim() && costDeltaCents == null) {
      Alert.alert('Invalid cost delta', 'Enter the cost impact as a signed CAD amount, like +250 or -125.50.');
      return;
    }
    const leadTimeInput = leadTimeDays.trim();
    const leadTime = leadTimeInput ? Number.parseInt(leadTimeInput, 10) : null;
    if (leadTimeInput && (leadTime == null || !Number.isInteger(leadTime) || leadTime < 0)) {
      Alert.alert('Invalid lead time', 'Enter lead time as whole days.');
      return;
    }

    setSubmitting(true);
    try {
      const title = `${material.item} material substitution`;
      const details = [
        `Recommended product: ${productName.trim()}`,
        supplier.trim() ? `Supplier/quote: ${supplier.trim()}` : null,
        colorFinish.trim() ? `Color/finish: ${colorFinish.trim()}` : null,
        quotedPriceCents != null ? `Quoted price: ${formatCadCents(quotedPriceCents)}` : null,
        leadTime != null ? `Lead time: ${leadTime} days` : null,
        quoteNote.trim() || null,
      ].filter(Boolean).join('\n');

      const { error } = await supabase.from('project_approval_requests').insert({
        project_id: projectId,
        requested_by_gc_id: assignment.general_contractor_id,
        homeowner_id: assignment.homeowner_id,
        request_type: 'material_substitution',
        title,
        description: details,
        cost_delta: costDeltaCents,
        timeline_delta_days: leadTime,
        metadata: {
          material_id: material.id,
          material_item: material.item,
          product_name: productName.trim(),
          supplier_name: supplier.trim() || null,
          color_finish: colorFinish.trim() || null,
          quoted_price_cents: quotedPriceCents,
          lead_time_days: leadTime,
          quote_note: quoteNote.trim() || null,
        },
      });
      if (error) throw error;
      Alert.alert('Sent for approval', 'Homeowner approval is required before the material preference changes.');
      setSelectedMaterialId(null);
      setProductName('');
      setSupplier('');
      setColorFinish('');
      setQuotedPrice('');
      setCostDelta('');
      setLeadTimeDays('');
      setQuoteNote('');
    } catch (err) {
      Alert.alert('Could not send recommendation', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-left" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.headerBody}>
              <Text style={styles.title}>Material Sourcing</Text>
              <Text style={styles.subtitle}>Recommend substitutions or supplier quotes for homeowner approval.</Text>
            </View>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.sectionTitle}>Homeowner approval required</Text>
            <Text style={styles.bodyText}>
              Recommendations update project material preferences only after approval. Supplier orders and escrow payments stay in their existing workflows.
            </Text>
          </GlassCard>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Materials unavailable</Text>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading materials...</Text>
            </GlassCard>
          ) : (
            <>
              <GlassCard style={styles.card}>
                <Text style={styles.sectionTitle}>Project materials</Text>
                {materials.length === 0 ? (
                  <Text style={styles.bodyText}>No materials have been generated for this project yet.</Text>
                ) : materials.map((material) => {
                  const selected = selectedMaterialId === material.id;
                  const materialOrders = orders.filter((order) => order.material_id === material.id);
                  return (
                    <TouchableOpacity
                      key={material.id}
                      style={[styles.materialRow, selected && styles.materialRowSelected]}
                      onPress={() => selectMaterial(material)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.materialIcon}>
                        <Icon name={selected ? 'check-circle' : 'cube-outline'} size={19} color={selected ? Colors.accent : Colors.text.secondary} />
                      </View>
                      <View style={styles.materialBody}>
                        <Text style={styles.materialName}>{material.item}</Text>
                        <Text style={styles.materialMeta}>
                          {formatQuantity(material)}
                          {material.quality_tier ? ` · ${material.quality_tier}` : ''}
                        </Text>
                        {[material.brand_preference, material.specific_model, material.color_finish].filter(Boolean).length > 0 ? (
                          <Text style={styles.preferenceText}>
                            {[material.brand_preference, material.specific_model, material.color_finish].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                        {materialOrders.slice(0, 2).map((order) => (
                          <Text key={order.id} style={styles.orderText}>
                            {formatStatusLabel(order.status)}
                            {supplierName(order) ? ` · ${supplierName(order)}` : ''}
                            {order.final_price != null || order.offered_price != null
                              ? ` · ${formatCadCents(order.final_price ?? order.offered_price ?? 0)}`
                              : ''}
                          </Text>
                        ))}
                      </View>
                      <StatusBadge label={selected ? 'Selected' : 'Review'} variant={selected ? 'active' : 'neutral'} size="sm" />
                    </TouchableOpacity>
                  );
                })}
              </GlassCard>

              {assignment?.status === 'active' && selectedMaterialId ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Recommendation details</Text>
                  <GlassInput
                    label="Replacement product"
                    value={productName}
                    onChangeText={setProductName}
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Supplier or quote source"
                    value={supplier}
                    onChangeText={setSupplier}
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Color or finish"
                    value={colorFinish}
                    onChangeText={setColorFinish}
                    containerStyle={styles.formInput}
                  />
                  <View style={styles.formRow}>
                    <GlassInput
                      label="Quoted price CAD"
                      value={quotedPrice}
                      onChangeText={setQuotedPrice}
                      keyboardType="decimal-pad"
                      containerStyle={styles.formHalf}
                    />
                    <GlassInput
                      label="Cost delta CAD"
                      value={costDelta}
                      onChangeText={setCostDelta}
                      keyboardType="numbers-and-punctuation"
                      containerStyle={styles.formHalf}
                    />
                  </View>
                  <GlassInput
                    label="Lead time days"
                    value={leadTimeDays}
                    onChangeText={setLeadTimeDays}
                    keyboardType="number-pad"
                    containerStyle={styles.formInput}
                  />
                  <GlassInput
                    label="Quote notes"
                    value={quoteNote}
                    onChangeText={setQuoteNote}
                    containerStyle={styles.formInput}
                  />
                  <GlassButton
                    label="Send Material Recommendation"
                    onPress={handleSubmit}
                    loading={submitting}
                    fullWidth
                  />
                </GlassCard>
              ) : assignment?.status === 'active' ? null : (
                <GlassCard style={styles.card}>
                  <Text style={styles.sectionTitle}>Homeowner confirmation required</Text>
                  <Text style={styles.bodyText}>
                    Material recommendations unlock after the homeowner confirms active GC management.
                  </Text>
                </GlassCard>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: Spacing.md },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  headerBody: { flex: 1 },
  title: { ...Typography.h2, marginBottom: 3 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 21 },
  card: { marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  materialRowSelected: {
    backgroundColor: 'rgba(255,107,0,0.08)',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  materialIcon: { width: 24, alignItems: 'center', paddingTop: 2 },
  materialBody: { flex: 1 },
  materialName: { ...Typography.body, fontWeight: '800' },
  materialMeta: { ...Typography.caption, marginTop: 3 },
  preferenceText: { ...Typography.caption, color: Colors.text.secondary, marginTop: 4, lineHeight: 18 },
  orderText: { ...Typography.caption, color: Colors.text.tertiary, marginTop: 4 },
  formInput: { marginBottom: Spacing.sm },
  formRow: { flexDirection: 'row', gap: 8 },
  formHalf: { flex: 1, marginBottom: Spacing.sm },
});
