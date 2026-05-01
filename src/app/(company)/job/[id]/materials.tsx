import { useEffect, useState } from 'react';
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
import { useAuthStore } from '@/stores/auth.store';
import { GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

interface Material {
  id: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  quality_tier: string | null;
  verified_quantity: number | null;
  verified_by: string | null;
}

export default function ContractorMaterialsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { id: projectId } = route.params as { id: string };
  const { user } = useAuthStore();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    setLoading(true);
    const { data, error } = await supabase
      .from('materials')
      .select('id, item, quantity, unit, quality_tier, verified_quantity, verified_by')
      .eq('project_id', projectId)
      .order('item');

    if (!error && data) {
      setMaterials(data);
      // Pre-fill with verified qty if exists, else AI quantity
      const initial: Record<string, string> = {};
      for (const m of data) {
        initial[m.id] = String(m.verified_quantity ?? m.quantity ?? '');
      }
      setQuantities(initial);
    }
    setLoading(false);
  }

  async function handleConfirm() {
    setSaving(true);
    try {
      // Update each material's verified quantity
      await Promise.all(
        materials.map((m) => {
          const qty = parseFloat(quantities[m.id] ?? '');
          if (isNaN(qty)) return Promise.resolve();
          return supabase
            .from('materials')
            .update({
              verified_quantity: qty,
              verified_by: user?.id,
              verified_at: new Date().toISOString(),
            })
            .eq('id', m.id);
        })
      );

      // Sync verified quantities to any existing material orders
      await Promise.all(
        materials.map(async (m) => {
          const qty = parseFloat(quantities[m.id] ?? '');
          if (isNaN(qty)) return;
          const { data: order } = await supabase
            .from('material_orders')
            .select('id, status')
            .eq('material_id', m.id)
            .eq('status', 'open')
            .maybeSingle();

          if (order) {
            await supabase
              .from('material_orders')
              .update({ quantity_needed: qty })
              .eq('id', order.id);
          }
        })
      );

      Alert.alert('Confirmed', 'Material quantities have been verified and saved.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save quantities.');
    } finally {
      setSaving(false);
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
                  <View key={m.id} style={[styles.materialCard, isVerified && styles.materialCardVerified]}>
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
                  </View>
                );
              })
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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

  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.sm, paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.9)',
  },
});
