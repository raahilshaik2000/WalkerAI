import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';
import { SUPPLIER_CATEGORIES, type SupplierCategory, type QualityTier } from '@/constants/enums';

const QUALITY_OPTIONS: QualityTier[] = ['budget', 'mid-range', 'luxury'];
const UNIT_OPTIONS = ['units', 'sq ft', 'linear ft', 'lbs', 'bags', 'sheets', 'rolls', 'gallons'];

export default function AddCatalogItem() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SupplierCategory | null>(null);
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('units');
  const [priceStr, setPriceStr] = useState('');
  const [brand, setBrand] = useState('');
  const [qualityTier, setQualityTier] = useState<QualityTier>('mid-range');
  const [leadTime, setLeadTime] = useState('3');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !category || !priceStr) {
      Alert.alert('Required', 'Please fill in name, category, and price.');
      return;
    }
    const price = Math.round(parseFloat(priceStr) * 100);
    if (isNaN(price) || price <= 0) { Alert.alert('Invalid price', 'Enter a valid price.'); return; }

    setLoading(true);
    try {
      const { data: sup } = await supabase.from('suppliers').select('id').eq('user_id', user!.id).single();
      if (!sup) throw new Error('Supplier profile not found');
      const { error } = await supabase.from('supplier_catalog').insert({
        supplier_id: sup.id,
        name: name.trim(),
        description: description.trim() || null,
        category,
        sku: sku.trim() || null,
        unit,
        price_per_unit: price,
        quality_tier: qualityTier,
        brand: brand.trim() || null,
        lead_time_days: parseInt(leadTime, 10) || 3,
        in_stock: true,
      });
      if (error) throw error;
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.navRow}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={24} color={Colors.text.secondary} />
              </TouchableOpacity>
              <Text style={styles.navTitle}>Add Catalog Item</Text>
              <View style={{ width: 24 }} />
            </View>

            <GlassCard style={styles.card}>
              <GlassInput label="Product Name" value={name} onChangeText={setName} containerStyle={styles.input} />
              <GlassInput label="Description (optional)" value={description} onChangeText={setDescription} multiline containerStyle={styles.input} />
              <GlassInput label="Brand (optional)" value={brand} onChangeText={setBrand} containerStyle={styles.input} />
              <GlassInput label="SKU (optional)" value={sku} onChangeText={setSku} containerStyle={styles.input} />
              <GlassInput label={`Price per unit (CAD $)`} value={priceStr} onChangeText={setPriceStr} keyboardType="decimal-pad" containerStyle={styles.input} />
              <GlassInput label="Lead time (days)" value={leadTime} onChangeText={setLeadTime} keyboardType="numeric" containerStyle={styles.input} />
            </GlassCard>

            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.chipGrid}>
              {SUPPLIER_CATEGORIES.map((c) => (
                <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Unit</Text>
            <View style={styles.chipGrid}>
              {UNIT_OPTIONS.map((u) => (
                <TouchableOpacity key={u} style={[styles.chip, unit === u && styles.chipActive]} onPress={() => setUnit(u)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Quality Tier</Text>
            <View style={styles.chipGrid}>
              {QUALITY_OPTIONS.map((q) => (
                <TouchableOpacity key={q} style={[styles.chip, qualityTier === q && styles.chipActive]} onPress={() => setQualityTier(q)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, qualityTier === q && styles.chipTextActive]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <GlassButton label="Save Item" onPress={handleSave} loading={loading} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  navTitle: { ...Typography.h3 },
  card: { padding: Spacing.md, marginBottom: Spacing.lg },
  input: { marginBottom: Spacing.sm },
  sectionLabel: { fontSize: 13, color: Colors.text.secondary, fontWeight: '600', marginBottom: 10, marginTop: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' },
  chipActive: { borderColor: Colors.accent, backgroundColor: 'rgba(255,107,0,0.12)' },
  chipText: { fontSize: 13, color: Colors.text.secondary },
  chipTextActive: { color: Colors.text.primary, fontWeight: '600' },
});
