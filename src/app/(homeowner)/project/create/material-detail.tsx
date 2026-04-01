import { useState } from 'react';
import {
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
import { useProjectWizardStore, type MaterialOverride } from '@/stores/project-wizard.store';
import { GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

type QualityTier = 'budget' | 'mid-range' | 'luxury';

const TIERS: { id: QualityTier; label: string; icon: string; color: string; description: string; example: string }[] = [
  {
    id: 'budget',
    label: 'Budget',
    icon: 'wallet-outline',
    color: '#6B7280',
    description: 'Cost-effective, functional materials. Great for rentals or flips.',
    example: 'e.g. Laminate countertops, builder-grade fixtures',
  },
  {
    id: 'mid-range',
    label: 'Mid-Range',
    icon: 'star-half-outline',
    color: '#60A5FA',
    description: 'Quality materials with good durability. Best value for most homeowners.',
    example: 'e.g. Quartz countertops, mid-grade cabinetry',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    icon: 'diamond-outline',
    color: '#F59E0B',
    description: 'Premium materials, top brands. Long-lasting and high-end finishes.',
    example: 'e.g. Marble countertops, custom cabinetry, designer fixtures',
  },
];

export default function MaterialDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { materialIndex, materialName, quantity, unit } = route.params as {
    materialIndex: number;
    materialName: string;
    quantity: number;
    unit: string;
  };

  const { materialOverrides, setMaterialOverride } = useProjectWizardStore();
  const existing = materialOverrides[materialIndex] ?? {};

  const [tier, setTier] = useState<QualityTier>(existing.quality_tier ?? 'mid-range');
  const [brand, setBrand] = useState(existing.brand_preference ?? '');
  const [colorFinish, setColorFinish] = useState(existing.color_finish ?? '');
  const [model, setModel] = useState(existing.specific_model ?? '');
  const [notes, setNotes] = useState(existing.contractor_notes ?? '');

  const handleSave = () => {
    const override: MaterialOverride = {
      quality_tier: tier,
      brand_preference: brand.trim() || undefined,
      color_finish: colorFinish.trim() || undefined,
      specific_model: model.trim() || undefined,
      contractor_notes: notes.trim() || undefined,
    };
    setMaterialOverride(materialIndex, override);
    navigation.goBack();
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>{materialName}</Text>
              <Text style={styles.headerSub}>{quantity} {unit}</Text>
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Quality Tier */}
            <Text style={styles.sectionLabel}>Quality Tier</Text>
            <View style={styles.tiersContainer}>
              {TIERS.map((t) => {
                const selected = tier === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.tierCard, selected && { borderColor: t.color, backgroundColor: t.color + '12' }]}
                    onPress={() => setTier(t.id)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.tierTop}>
                      <View style={[styles.tierIconWrap, { backgroundColor: t.color + '20' }]}>
                        <Ionicons name={t.icon} size={20} color={t.color} />
                      </View>
                      <View style={styles.tierInfo}>
                        <Text style={[styles.tierLabel, selected && { color: t.color }]}>{t.label}</Text>
                        <Text style={styles.tierDesc}>{t.description}</Text>
                      </View>
                      <View style={[styles.tierRadio, selected && { borderColor: t.color }]}>
                        {selected && <View style={[styles.tierRadioInner, { backgroundColor: t.color }]} />}
                      </View>
                    </View>
                    <Text style={styles.tierExample}>{t.example}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Brand Preference */}
            <Text style={styles.sectionLabel}>Brand Preference <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. IKEA, Moen, Shaw, Samsung…"
              placeholderTextColor={Colors.text.tertiary}
              value={brand}
              onChangeText={setBrand}
            />

            {/* Color / Finish */}
            <Text style={styles.sectionLabel}>Color / Finish <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Matte black, Brushed nickel, White oak…"
              placeholderTextColor={Colors.text.tertiary}
              value={colorFinish}
              onChangeText={setColorFinish}
            />

            {/* Specific Model / Product */}
            <Text style={styles.sectionLabel}>Specific Model or Product <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Model #, product name, or store link…"
              placeholderTextColor={Colors.text.tertiary}
              value={model}
              onChangeText={setModel}
            />

            {/* Notes for Contractor */}
            <Text style={styles.sectionLabel}>Notes for Contractor <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Any additional requirements, placement preferences, or special instructions…"
              placeholderTextColor={Colors.text.tertiary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <TouchableOpacity style={styles.saveFullBtn} onPress={handleSave} activeOpacity={0.85}>
              <Ionicons name="checkmark-circle" size={20} color="#000" />
              <Text style={styles.saveFullBtnText}>Save Material Details</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.glass.surface, borderWidth: 1, borderColor: Colors.glass.border, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: Colors.text.tertiary, marginTop: 1 },
  saveBtn: { backgroundColor: '#FF6B00', borderRadius: Radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },

  scroll: { paddingHorizontal: Spacing.md, paddingBottom: 60 },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 20 },
  optional: { fontWeight: '400', textTransform: 'none', letterSpacing: 0 },

  tiersContainer: { gap: 10 },
  tierCard: { borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.glass.border, backgroundColor: Colors.glass.surface, padding: 14 },
  tierTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  tierIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  tierInfo: { flex: 1 },
  tierLabel: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  tierDesc: { fontSize: 13, color: Colors.text.secondary, lineHeight: 18 },
  tierRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.glass.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  tierRadioInner: { width: 10, height: 10, borderRadius: 5 },
  tierExample: { fontSize: 12, color: Colors.text.tertiary, fontStyle: 'italic', paddingLeft: 52 },

  input: { backgroundColor: Colors.glass.surface, borderRadius: Radius.item, borderWidth: 1, borderColor: Colors.glass.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#fff' },
  inputMulti: { height: 110, paddingTop: 14 },

  saveFullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF6B00', borderRadius: Radius.card, paddingVertical: 16, marginTop: 28 },
  saveFullBtnText: { fontSize: 16, fontWeight: '700', color: '#000' },
});
