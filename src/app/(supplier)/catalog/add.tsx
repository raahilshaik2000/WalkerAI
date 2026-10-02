import { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/auth';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { pickAndUploadCatalogPhoto } from '@/lib/catalog-photo';
import { supplierQueryKeys } from '@/lib/supplier-data';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, ListItemSkeleton } from '@/components/ui';
import { type SupplierCategory, type QualityTier } from '@/constants/enums';
import {
  nextCatalogSetupRoute,
  parseNonNegativeDays,
  parsePositiveCadToCents,
  selectedSupplierCategories,
} from '@/lib/supplier-catalog';

const QUALITY_OPTIONS: QualityTier[] = ['budget', 'mid-range', 'luxury'];
const UNIT_OPTIONS = ['units', 'sq ft', 'linear ft', 'lbs', 'bags', 'sheets', 'rolls', 'gallons'];

export default function AddCatalogItem() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
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
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<SupplierCategory[]>([]);
  const [setupRoute, setSetupRoute] = useState<string | null>(null);

  const [customCategory, setCustomCategory] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;
        if (!currentUserId) {
          if (!mounted) return;
          setSupplierId(null);
          setAvailableCategories([]);
          setSetupRoute('SupplierBusinessOnboarding');
          return;
        }

        const { data, error } = await supabase
          .from('suppliers')
          .select('id, license_number, categories')
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!mounted) return;
        if (error) {
          Alert.alert('Could not load supplier profile', formatAppSafeErrorMessage(error, 'Please try again.'));
          navigation.goBack();
          return;
        }

        const route = nextCatalogSetupRoute(data);
        const categories = selectedSupplierCategories(data?.categories);
        const allCategories = categories.includes('Other') ? categories : [...categories, 'Other' as SupplierCategory];
        setSupplierId(data?.id ?? null);
        setAvailableCategories(allCategories);
        setCategory((current) => current && allCategories.includes(current) ? current : allCategories[0] ?? null);
        setSetupRoute(route);
      } catch (err) {
        if (!mounted) return;
        Alert.alert('Could not load supplier profile', formatAppSafeErrorMessage(err, 'Please try again.'));
        navigation.goBack();
      } finally {
        if (mounted) setProfileLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [navigation, user?.id]);

  const handleSave = async () => {
    if (!name.trim() || !category || !priceStr) {
      Alert.alert('Required', 'Please fill in name, category, and price.');
      return;
    }
    if (category === 'Other' && !customCategory.trim()) {
      Alert.alert('Custom Category Required', 'Please specify the custom category name for this material.');
      return;
    }
    const price = parsePositiveCadToCents(priceStr);
    if (price == null) { Alert.alert('Invalid price', 'Enter a valid price greater than $0, with up to two decimal places and below $21,474,836.47.'); return; }
    let currentUserId: string | null = null;
    try {
      currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;
    } catch (err) {
      Alert.alert('Sign in required', formatAppSafeErrorMessage(err, 'Please sign in again before adding catalog items.'));
      return;
    }
    if (!currentUserId) { Alert.alert('Sign in required', 'Please sign in again before adding catalog items.'); return; }
    if (!supplierId || setupRoute) {
      Alert.alert('Supplier setup required', 'Complete your supplier profile, license, and supply categories before adding catalog items.');
      return;
    }
    if (!category || !availableCategories.includes(category)) {
      Alert.alert('Category required', 'Choose one of the supply categories selected in your supplier profile.');
      return;
    }

    const leadTimeDays = parseNonNegativeDays(leadTime);
    if (leadTimeDays == null) {
      Alert.alert('Invalid lead time', 'Enter a whole number of days.');
      return;
    }

    setLoading(true);
    try {
      const finalDescription = category === 'Other' && customCategory.trim()
        ? `[Category: ${customCategory.trim()}] ${description.trim()}`.trim()
        : description.trim() || null;

      const { data: inserted, error } = await supabase.from('supplier_catalog').insert({
        supplier_id: supplierId,
        name: name.trim(),
        description: finalDescription,
        category,
        sku: sku.trim() || null,
        unit,
        price_per_unit: price,
        quality_tier: qualityTier,
        brand: brand.trim() || null,
        lead_time_days: leadTimeDays,
        in_stock: true,
        image_urls: imageUrl ? [imageUrl] : [],
      }).select('id').maybeSingle();
      if (error) throw error;
      if (!inserted) throw new Error('Catalog item was not saved.');
      queryClient.invalidateQueries({ queryKey: supplierQueryKeys.catalog(supplierId) });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save catalog item', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.safe}>
          <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.md }}>
            <ListItemSkeleton style={{ marginBottom: 12 }} />
            <ListItemSkeleton style={{ marginBottom: 12 }} />
            <ListItemSkeleton />
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  if (setupRoute) {
    return (
      <GradientBackground glow="top-right">
        <SafeAreaView style={styles.safe}>
          <View style={styles.setupState}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.setupClose}>
              <Ionicons name="close" size={24} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Ionicons name="storefront-outline" size={44} color={Colors.text.tertiary} />
            <Text style={styles.setupTitle}>Finish supplier setup</Text>
            <Text style={styles.setupBody}>
              Complete your supplier profile, license, and supply categories before adding catalog items.
            </Text>
            <TouchableOpacity style={styles.setupBtn} onPress={() => navigation.navigate(setupRoute)} activeOpacity={0.8}>
              <Text style={styles.setupBtnText}>Continue Setup</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

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

            <GlassCard style={styles.card} padding={Spacing.md}>
              <Text style={styles.photoLabel}>Product photo</Text>
              <TouchableOpacity
                style={styles.photoBox}
                activeOpacity={0.85}
                disabled={!supplierId || uploadingPhoto}
                onPress={async () => {
                  if (!supplierId) return;
                  setUploadingPhoto(true);
                  try {
                    const url = await pickAndUploadCatalogPhoto(supplierId);
                    if (url) setImageUrl(url);
                  } catch (err) {
                    Alert.alert('Photo upload failed', formatAppSafeErrorMessage(err, 'Please try again.'));
                  } finally {
                    setUploadingPhoto(false);
                  }
                }}
              >
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera-outline" size={28} color={Colors.text.tertiary} />
                    <Text style={styles.photoHint}>
                      {uploadingPhoto ? 'Uploading…' : 'Add photo for the design tool'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              {imageUrl ? (
                <TouchableOpacity onPress={() => setImageUrl(null)} style={{ marginBottom: Spacing.sm }}>
                  <Text style={styles.removePhoto}>Remove photo</Text>
                </TouchableOpacity>
              ) : null}
              <GlassInput label="Product Name" value={name} onChangeText={setName} containerStyle={styles.input} />
              <GlassInput label="Description (optional)" value={description} onChangeText={setDescription} containerStyle={styles.input} />
              <GlassInput label="Brand (optional)" value={brand} onChangeText={setBrand} containerStyle={styles.input} />
              <GlassInput label="SKU (optional)" value={sku} onChangeText={setSku} containerStyle={styles.input} />
              <GlassInput label={`Price per unit (CAD $)`} value={priceStr} onChangeText={setPriceStr} keyboardType="decimal-pad" containerStyle={styles.input} />
              <GlassInput label="Lead time (days)" value={leadTime} onChangeText={setLeadTime} keyboardType="numeric" containerStyle={styles.input} />
            </GlassCard>

            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.chipGrid}>
              {availableCategories.map((c) => (
                <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)} activeOpacity={0.7}>
                  <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                    {c === 'Other' ? 'Other / Custom' : c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {category === 'Other' && (
              <GlassCard style={[styles.card, { marginTop: Spacing.sm }]} padding={Spacing.md}>
                <GlassInput
                  label="Custom Category / Material Type"
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  placeholder="e.g. Specialty Lighting, Custom Glass, Millwork"
                />
              </GlassCard>
            )}

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingBottom: 64 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md },
  navTitle: { ...Typography.h3 },
  card: { marginBottom: Spacing.lg },
  input: { marginBottom: Spacing.sm },
  photoLabel: { fontSize: 13, color: Colors.text.secondary, fontWeight: '600', marginBottom: 8 },
  photoBox: {
    height: 160,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: Spacing.sm,
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoHint: { fontSize: 13, color: Colors.text.tertiary },
  removePhoto: { color: Colors.accent, fontWeight: '600', fontSize: 13 },
  sectionLabel: { fontSize: 13, color: Colors.text.secondary, fontWeight: '600', marginBottom: 10, marginTop: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' },
  chipActive: { borderColor: Colors.accent, backgroundColor: 'rgba(255,107,0,0.12)' },
  chipText: { fontSize: 13, color: Colors.text.secondary },
  chipTextActive: { color: Colors.text.primary, fontWeight: '600' },
  setupState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: Spacing.xl },
  setupClose: { position: 'absolute', top: Spacing.md, left: Spacing.md },
  setupTitle: { ...Typography.h3, textAlign: 'center' },
  setupBody: { ...Typography.bodySecondary, textAlign: 'center' },
  setupBtn: { backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  setupBtnText: { fontSize: 15, fontWeight: '700', color: Colors.accentFg },
});
