import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { parseNonNegativeMetricQuantity } from '@/lib/measurements';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { TradeMetricStrip, TradePanel } from '@/components/company/TradeUI';

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
  verified_quantity: number | null;
  verified_by: string | null;
}

interface SupplierOrder {
  id: string;
  status: string;
  final_price: number | null;
  quantity_needed: number;
  unit: string;
  accepted_supplier_id: string | null;
  material?: { item: string | null } | Array<{ item: string | null }> | null;
  accepted_supplier?: { business_name: string | null } | Array<{ business_name: string | null }> | null;
}

interface SupplierReview {
  id: string;
  order_id: string;
  rating: number;
  comment: string | null;
}

function parseQuantity(raw: string): number | null {
  return parseNonNegativeMetricQuantity(raw);
}

function isMissingColumnError(message?: string | null) {
  if (!message) return false;
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
}

async function fetchProjectMaterials(projectId: string): Promise<{ data: Material[] | null; error: any }> {
  const fullResult = await supabase
    .from('materials')
    .select('id, item, quantity, unit, quality_tier, brand_preference, color_finish, specific_model, contractor_notes, verified_quantity, verified_by')
    .eq('project_id', projectId)
    .order('item');

  if (!isMissingColumnError(fullResult.error?.message)) {
    return { data: fullResult.data as Material[] | null, error: fullResult.error };
  }

  const fallbackResult = await supabase
    .from('materials')
    .select('id, item, quantity, unit, quality_tier, verified_quantity, verified_by')
    .eq('project_id', projectId)
    .order('item');

  return {
    data: fallbackResult.data
      ? (fallbackResult.data as Omit<Material, 'brand_preference' | 'color_finish' | 'specific_model' | 'contractor_notes'>[]).map((material) => ({
        ...material,
        brand_preference: null,
        color_finish: null,
        specific_model: null,
        contractor_notes: null,
      }))
      : null,
    error: fallbackResult.error,
  };
}

function materialOrderGenerationMessage(message: string) {
  if (/project must be active/i.test(message)) {
    return 'Material quantities were verified. Supplier orders will be generated after the homeowner funds the approved quote.';
  }
  return null;
}

export default function ContractorMaterialsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const { user } = useAuthStore();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierOrders, setSupplierOrders] = useState<SupplierOrder[]>([]);
  const [existingReviews, setExistingReviews] = useState<Record<string, SupplierReview>>({});
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingReview, setSubmittingReview] = useState<string | null>(null);

  const loadMaterials = useCallback(async () => {
    setLoading(true);

    if (!projectId) {
      setMaterials([]);
      setSupplierOrders([]);
      setExistingReviews({});
      setLoading(false);
      return;
    }

    const [materialsResult, ordersResult] = await Promise.all([
      fetchProjectMaterials(projectId),
      supabase
        .from('material_orders')
        .select(`
          id, status, final_price, quantity_needed, unit, accepted_supplier_id,
          material:materials!material_orders_material_id_fkey(item),
          accepted_supplier:suppliers!accepted_supplier_id(business_name)
        `)
        .eq('project_id', projectId)
        .in('status', ['delivered', 'confirmed', 'paid'])
        .order('created_at', { ascending: false }),
    ]);

    if (materialsResult.error) {
      Alert.alert('Could not load materials', formatAppSafeErrorMessage(materialsResult.error, 'Please try again.'));
    } else if (materialsResult.data) {
      setMaterials(materialsResult.data);
      // Pre-fill with verified qty if exists, else AI quantity
      const initial: Record<string, string> = {};
      for (const m of materialsResult.data) {
        initial[m.id] = String(m.verified_quantity ?? m.quantity ?? '');
      }
      setQuantities(initial);
    }

    if (ordersResult.error) {
      Alert.alert('Could not load supplier orders', formatAppSafeErrorMessage(ordersResult.error, 'Please try again.'));
    } else {
      const orders = (ordersResult.data ?? []) as SupplierOrder[];
      setSupplierOrders(orders);

      if (user?.id && orders.length > 0) {
        const { data: reviews, error: reviewsError } = await supabase
          .from('supplier_reviews')
          .select('id, order_id, rating, comment')
          .eq('reviewer_id', user.id)
          .in('order_id', orders.map((order) => order.id));
        if (reviewsError) {
          Alert.alert('Could not load supplier reviews', formatAppSafeErrorMessage(reviewsError, 'Please try again.'));
        } else {
          const byOrder: Record<string, SupplierReview> = {};
          for (const review of (reviews ?? []) as SupplierReview[]) {
            byOrder[review.order_id] = review;
          }
          setExistingReviews(byOrder);
        }
      } else {
        setExistingReviews({});
      }
    }
    setLoading(false);
  }, [projectId, user?.id]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  async function handleConfirm() {
    if (!user?.id) {
      Alert.alert('Error', 'You need to be signed in to verify materials.');
      return;
    }

    setSaving(true);
    try {
      const verifiedAt = new Date().toISOString();

      // Update each material's verified quantity
      await Promise.all(
        materials.map(async (m) => {
          const rawQty = quantities[m.id] ?? '';
          const qty = parseQuantity(rawQty);

          if (qty === null) {
            throw new Error(`Enter a valid quantity for ${m.item}.`);
          }

          const { data, error } = await supabase
            .from('materials')
            .update({
              verified_quantity: qty,
              verified_by: user.id,
              verified_at: verifiedAt,
            })
            .eq('id', m.id)
            .eq('project_id', projectId)
            .select('id')
            .maybeSingle();

          if (error) {
            throw new Error(formatAppSafeErrorMessage(error, `Could not save ${m.item}.`));
          }
          if (!data) {
            throw new Error(`Failed to save ${m.item}: material row not found.`);
          }
        })
      );

      // Sync verified quantities to any existing material orders
      await Promise.all(
        materials.map(async (m) => {
          const qty = parseQuantity(quantities[m.id] ?? '');
          if (qty === null) {
            throw new Error(`Enter a valid quantity for ${m.item}.`);
          }

          const { data: order, error: orderError } = await supabase
            .from('material_orders')
            .select('id, status')
            .eq('material_id', m.id)
            .eq('project_id', projectId)
            .eq('status', 'open')
            .maybeSingle();

          if (orderError) {
            throw new Error(formatAppSafeErrorMessage(orderError, `Could not load ${m.item} order.`));
          }

          if (order) {
            const { error } = await supabase
              .from('material_orders')
              .update({ quantity_needed: qty })
              .eq('id', order.id)
              .eq('project_id', projectId);

            if (error) {
              throw new Error(formatAppSafeErrorMessage(error, `Could not sync ${m.item} order.`));
            }
          }
        })
      );

      let confirmationMessage = 'Material quantities have been verified and saved.';
      const { data: orderData, error: orderGenerationError } = await supabase.functions.invoke('generate-material-orders', {
        body: { project_id: projectId },
      });
      if (orderGenerationError) {
        const formatted = await formatSupabaseFunctionError(orderGenerationError);
        const nonBlockingMessage = materialOrderGenerationMessage(formatted);
        if (nonBlockingMessage) {
          confirmationMessage = nonBlockingMessage;
        } else {
          throw new Error(`Quantities were saved, but supplier orders could not be generated: ${formatted}`);
        }
      } else if (orderData?.orders_created > 0) {
        confirmationMessage = `${orderData.orders_created} supplier material order${orderData.orders_created === 1 ? '' : 's'} generated from verified quantities.`;
      }

      Alert.alert('Confirmed', confirmationMessage);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save quantities', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSupplierReview(order: SupplierOrder) {
    if (!user?.id) {
      Alert.alert('Error', 'You need to be signed in to review a supplier.');
      return;
    }
    if (!order.accepted_supplier_id) {
      Alert.alert('Supplier missing', 'This order does not have an assigned supplier.');
      return;
    }
    const rating = reviewRatings[order.id] ?? 0;
    if (rating < 1) {
      Alert.alert('Rating required', 'Select a star rating before submitting the supplier review.');
      return;
    }

    setSubmittingReview(order.id);
    try {
      const { data, error } = await supabase
        .from('supplier_reviews')
        .insert({
          order_id: order.id,
          supplier_id: order.accepted_supplier_id,
          reviewer_id: user.id,
          rating,
          comment: reviewComments[order.id]?.trim() || null,
        })
        .select('id')
        .maybeSingle();
      if (error) {
        if (/duplicate key|supplier_reviews_order_id_reviewer_id_key/i.test(error.message)) {
          throw new Error('You have already reviewed this supplier order.');
        }
        throw error;
      }
      if (!data) throw new Error('Supplier review was not saved.');
      await loadMaterials();
    } catch (err) {
      Alert.alert('Could not submit supplier review', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmittingReview(null);
    }
  }

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.centered}>
          <ActivityIndicator size="large" color="#FF6B00" />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (!projectId) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.centered}>
          <Ionicons name="warning-outline" size={42} color={Colors.warning} />
          <Text style={styles.missingTitle}>Project not found</Text>
          <Text style={styles.missingText}>This materials link is missing a project ID.</Text>
          <GlassButton label="Go back" onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
        </SafeAreaView>
      </GradientBackground>
    );
  }

  const verifiedCount = materials.filter((m) => !!m.verified_by).length;
  const reviewableOrders = supplierOrders.filter((order) => !!order.accepted_supplier_id);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Verify Materials</Text>
              <Text style={styles.headerSub}>Adjust quantities as needed</Text>
            </View>
            <GlassButton label="Confirm" variant="primary" size="sm" onPress={handleConfirm} loading={saving} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.intro}>
              Review the AI-estimated quantities below. Update any items where your field assessment differs from the estimate.
            </Text>

            <TradeMetricStrip
              items={[
                { label: 'Items', value: materials.length, tone: 'muted' },
                { label: 'Verified', value: verifiedCount, tone: verifiedCount === materials.length && materials.length > 0 ? 'success' : 'warning' },
                { label: 'Changed', value: Object.entries(quantities).filter(([id, qty]) => {
                  const material = materials.find((m) => m.id === id);
                  return material && qty !== String(material.quantity ?? '');
                }).length, tone: 'muted' },
              ]}
            />

            {materials.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={40} color={Colors.text.tertiary} />
                <Text style={styles.emptyText}>No materials found for this project.</Text>
              </View>
            ) : (
              materials.map((m) => {
                const isVerified = !!m.verified_by;
                const currentQty = quantities[m.id] ?? '';
                const originalQty = String(m.quantity ?? '');
                const changed = currentQty !== originalQty && currentQty !== '';

                return (
                  <TradePanel key={m.id} style={[styles.materialCard, isVerified && styles.materialCardVerified]}>
                    <View style={styles.materialTop}>
                      <View style={styles.materialInfo}>
                        <Text style={styles.materialName}>{m.item}</Text>
                        <View style={styles.tags}>
                          {m.quality_tier ? (
                            <View style={styles.tierTag}>
                              <Text style={styles.tierTagText}>{m.quality_tier}</Text>
                            </View>
                          ) : null}
                          {isVerified ? (
                            <View style={styles.verifiedTag}>
                              <Ionicons name="checkmark-circle" size={11} color="#34D399" />
                              <Text style={styles.verifiedTagText}>Verified</Text>
                            </View>
                          ) : null}
                          {changed ? (
                            <View style={styles.changedTag}>
                              <Text style={styles.changedTagText}>Modified</Text>
                            </View>
                          ) : null}
                        </View>
                        {(m.brand_preference || m.color_finish || m.specific_model || m.contractor_notes) && (
                          <View style={styles.preferenceBox}>
                            {m.brand_preference ? (
                              <Text style={styles.preferenceText}>Brand: {m.brand_preference}</Text>
                            ) : null}
                            {m.color_finish ? (
                              <Text style={styles.preferenceText}>Color/finish: {m.color_finish}</Text>
                            ) : null}
                            {m.specific_model ? (
                              <Text style={styles.preferenceText}>Product/model: {m.specific_model}</Text>
                            ) : null}
                            {m.contractor_notes ? (
                              <Text style={styles.preferenceText}>Notes: {m.contractor_notes}</Text>
                            ) : null}
                          </View>
                        )}
                      </View>

                      <View style={styles.qtyWrap}>
                        <TextInput
                          style={styles.qtyInput}
                          value={currentQty}
                          onChangeText={(v) => setQuantities((prev) => ({ ...prev, [m.id]: v }))}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          placeholderTextColor={Colors.text.tertiary}
                          placeholder="0"
                        />
                        <Text style={styles.qtyUnit}>{m.unit ?? ''}</Text>
                      </View>
                    </View>

                    {changed && (
                      <Text style={styles.changeNote}>
                        AI estimated: {originalQty} {m.unit}
                      </Text>
                    )}
                  </TradePanel>
                );
              })
            )}

            {reviewableOrders.length > 0 && (
              <>
                <Text style={styles.supplierSectionTitle}>Supplier deliveries</Text>
                <Text style={styles.supplierSectionSub}>
                  Review suppliers after materials are delivered so future matching uses real fulfillment feedback.
                </Text>
                {reviewableOrders.map((order) => {
                  const supplier = Array.isArray(order.accepted_supplier)
                    ? order.accepted_supplier[0]
                    : order.accepted_supplier;
                  const material = Array.isArray(order.material) ? order.material[0] : order.material;
                  const existingReview = existingReviews[order.id];

                  return (
                    <TradePanel key={order.id} style={styles.supplierCard}>
                      <View style={styles.supplierHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.supplierMaterial}>{material?.item ?? 'Material order'}</Text>
                          <Text style={styles.supplierMeta}>
                            {supplier?.business_name ?? 'Supplier'} · {order.quantity_needed} {order.unit} · {order.status}
                          </Text>
                        </View>
                        {order.final_price != null && (
                          <Text style={styles.supplierPrice}>
                            ${(order.final_price / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </Text>
                        )}
                      </View>

                      {existingReview ? (
                        <View style={styles.reviewedBox}>
                          <StarRating rating={existingReview.rating} onRate={() => {}} disabled />
                          <Text style={styles.reviewedText}>
                            {existingReview.comment || 'Supplier reviewed'}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.reviewBox}>
                          <StarRating
                            rating={reviewRatings[order.id] ?? 0}
                            onRate={(rating) => setReviewRatings((prev) => ({ ...prev, [order.id]: rating }))}
                          />
                          <TextInput
                            style={styles.reviewInput}
                            value={reviewComments[order.id] ?? ''}
                            onChangeText={(comment) => setReviewComments((prev) => ({ ...prev, [order.id]: comment }))}
                            placeholder="Optional notes about delivery, quality, or communication"
                            placeholderTextColor={Colors.text.tertiary}
                            multiline
                          />
                          <GlassButton
                            label="Submit Supplier Review"
                            onPress={() => handleSupplierReview(order)}
                            loading={submittingReview === order.id}
                            fullWidth
                            size="sm"
                          />
                        </View>
                      )}
                    </TradePanel>
                  );
                })}
              </>
            )}

            <View style={{ height: 120 }} />
          </ScrollView>

          <View style={styles.bottom}>
            <GlassButton
              label="Confirm All Quantities"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleConfirm}
              loading={saving}
              icon={<Ionicons name="checkmark-circle" size={20} color="#000" />}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function StarRating({
  rating,
  onRate,
  disabled = false,
}: {
  rating: number;
  onRate: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((value) => (
        <TouchableOpacity
          key={value}
          onPress={() => onRate(value)}
          disabled={disabled}
          activeOpacity={0.75}
        >
          <Ionicons
            name={value <= rating ? 'star' : 'star-outline'}
            size={26}
            color={value <= rating ? Colors.warning : Colors.text.tertiary}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  missingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  missingText: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
  },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.glass.surface,
    borderWidth: 1, borderColor: Colors.glass.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: Colors.text.tertiary, marginTop: 1 },

  scroll: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.xs },
  intro: { ...Typography.bodySecondary, lineHeight: 22, marginBottom: Spacing.md },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { ...Typography.bodySecondary },

  materialCard: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 14,
    marginBottom: Spacing.sm,
  },
  materialCardVerified: {
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  materialTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  materialInfo: { flex: 1 },
  materialName: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preferenceBox: {
    marginTop: 8,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  preferenceText: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.text.secondary,
  },

  tierTag: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  tierTagText: { fontSize: 11, color: Colors.text.secondary, fontWeight: '600' },

  verifiedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  verifiedTagText: { fontSize: 11, color: '#34D399', fontWeight: '600' },

  changedTag: {
    backgroundColor: 'rgba(255,107,0,0.15)',
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  changedTagText: { fontSize: 11, color: '#FF6B00', fontWeight: '600' },

  qtyWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.item, borderWidth: 1, borderColor: Colors.glass.border,
    paddingHorizontal: 10, height: 40, minWidth: 80,
  },
  qtyInput: {
    fontSize: 16, fontWeight: '700', color: '#fff',
    minWidth: 40, textAlign: 'right',
  },
  qtyUnit: { fontSize: 12, color: Colors.text.tertiary, marginLeft: 4 },

  changeNote: { fontSize: 12, color: Colors.text.tertiary, marginTop: 8, fontStyle: 'italic' },
  supplierSectionTitle: { ...Typography.h3, marginTop: Spacing.lg, marginBottom: 4 },
  supplierSectionSub: { ...Typography.bodySecondary, lineHeight: 20, marginBottom: Spacing.sm },
  supplierCard: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    padding: 14,
    marginBottom: Spacing.sm,
  },
  supplierHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 },
  supplierMaterial: { fontSize: 15, fontWeight: '700', color: Colors.text.primary, marginBottom: 4 },
  supplierMeta: { ...Typography.caption, textTransform: 'capitalize' },
  supplierPrice: { fontSize: 14, fontWeight: '700', color: Colors.success },
  reviewedBox: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.25)',
    backgroundColor: 'rgba(52,211,153,0.08)',
    padding: 10,
    gap: 6,
  },
  reviewedText: { ...Typography.bodySecondary, lineHeight: 20 },
  reviewBox: { gap: 10 },
  starRow: { flexDirection: 'row', gap: 6 },
  reviewInput: {
    minHeight: 72,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: Colors.text.primary,
    padding: 10,
    textAlignVertical: 'top',
  },

  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.sm, paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.9)',
  },
});
