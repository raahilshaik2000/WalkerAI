import { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/auth';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { pickAndUploadCatalogPhoto } from '@/lib/catalog-photo';
import { supplierQueryKeys } from '@/lib/supplier-data';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, ListItemSkeleton } from '@/components/ui';
import { type SupplierCategory, type QualityTier } from '@/constants/enums';
import {
  parseNonNegativeDays,
  parsePositiveCadToCents,
  selectedSupplierCategories,
} from '@/lib/supplier-catalog';

const QUALITY_OPTIONS: QualityTier[] = ['budget', 'mid-range', 'luxury'];
const UNIT_OPTIONS = ['units', 'sq ft', 'linear ft', 'lbs', 'bags', 'sheets', 'rolls', 'gallons'];

export default function EditCatalogItem() {
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const route = useRoute<any>();
  const itemId = getRequiredStringParam(route.params, 'itemId');
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [availableCategories, setAvailableCategories] = useState<SupplierCategory[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!itemId) {
          Alert.alert('Missing item', 'Reopen this catalog item and try again.');
          navigation.goBack();
          return;
        }

        const currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;
        if (!currentUserId) {
          Alert.alert('Sign in required', 'Please sign in again before editing catalog items.');
          navigation.goBack();
          return;
        }

        const [supplierResult, itemResult] = await Promise.all([
          supabase
            .from('suppliers')
            .select('id, categories')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('supplier_catalog')
            .select('id, supplier_id, name, description, category, sku, unit, price_per_unit, quality_tier, brand, lead_time_days, in_stock, stock_quantity, image_urls, created_at')
            .eq('id', itemId)
            .maybeSingle(),
        ]);

        if (!mounted) return;
        if (supplierResult.error) {
          Alert.alert('Could not load supplier profile', formatAppSafeErrorMessage(supplierResult.error, 'Please try again.'));
          navigation.goBack();
          return;
        }
        if (!supplierResult.data) {
          Alert.alert('Supplier setup required', 'Complete supplier setup before editing catalog items.');
          navigation.goBack();
          return;
        }

        const { data, error } = itemResult;
        if (error || !data) {
          Alert.alert('Could not load catalog item', formatAppSafeErrorMessage(error, 'Please try again.'));
          navigation.goBack();
          return;
        }
        if (data.supplier_id !== supplierResult.data.id) {
          Alert.alert('Item unavailable', 'This catalog item does not belong to your supplier profile.');
          navigation.goBack();
          return;
        }

        setSupplierId(supplierResult.data.id);
        const categories = selectedSupplierCategories(supplierResult.data.categories);
        if (categories.length === 0) {
          Alert.alert('Supply categories required', 'Select supply categories before editing catalog items.');
          navigation.goBack();
          return;
        }
        setAvailableCategories(categories);
        setName(data.name);
        setDescription(data.description ?? '');
        setCategory(data.category as SupplierCategory);
        setSku(data.sku ?? '');
        setUnit(data.unit);
        setPriceStr((data.price_per_unit / 100).toFixed(2));
        setBrand(data.brand ?? '');
        setQualityTier(data.quality_tier as QualityTier);
        setLeadTime(String(data.lead_time_days ?? 3));
        const firstImage = Array.isArray(data.image_urls)
          ? data.image_urls.find((u: string) => typeof u === 'string' && u.startsWith('http'))
          : null;
        setImageUrl(firstImage ?? null);
      } catch (err) {
        if (!mounted) return;
        Alert.alert('Could not load catalog item', formatAppSafeErrorMessage(err, 'Please try again.'));
        navigation.goBack();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [itemId, navigation, user?.id]);

  const handleSave = async () => {
    if (!name.trim() || !category || !priceStr) {
      Alert.alert('Required', 'Please fill in name, category, and price.');
      return;
    }
    if (!availableCategories.includes(category)) {
      Alert.alert('Category required', 'Choose one of the supply categories selected in your supplier profile.');
      return;
    }
    const price = parsePositiveCadToCents(priceStr);
    if (price == null) { Alert.alert('Invalid price', 'Enter a valid price greater than $0, with up to two decimal places and below $21,474,836.47.'); return; }
    const leadTimeDays = parseNonNegativeDays(leadTime);
    if (leadTimeDays == null) {
      Alert.alert('Invalid lead time', 'Enter a whole number of days.');
      return;
    }
    if (!itemId) {
      Alert.alert('Missing item', 'Reopen this catalog item and try again.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.from('supplier_catalog').update({
        name: name.trim(),
        description: description.trim() || null,
        category,
        sku: sku.trim() || null,
        unit,
        price_per_unit: price,
        quality_tier: qualityTier,
        brand: brand.trim() || null,
        lead_time_days: leadTimeDays,
        image_urls: imageUrl ? [imageUrl] : [],
      }).eq('id', itemId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Catalog item was not saved.');
      if (supplierId) queryClient.invalidateQueries({ queryKey: supplierQueryKeys.catalog(supplierId) });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save catalog item', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Item', 'Remove this item from your catalog?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!itemId) {
            Alert.alert('Missing item', 'Reopen this catalog item and try again.');
            return;
          }
          setDeleting(true);
          const { data, error } = await supabase
            .from('supplier_catalog')
            .delete()
            .eq('id', itemId)
            .select('id')
            .maybeSingle();
          if (error) {
            Alert.alert('Could not delete catalog item', formatAppSafeErrorMessage(error, 'Please try again.'));
            setDeleting(false);
          } else if (!data) {
            Alert.alert('Catalog item unavailable', 'This catalog item is no longer available.');
            setDeleting(false);
          } else {
            if (supplierId) queryClient.invalidateQueries({ queryKey: supplierQueryKeys.catalog(supplierId) });
            navigation.goBack();
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.center}>
          <View style={{ width: '100%', paddingHorizontal: Spacing.md }}>
            <ListItemSkeleton style={{ marginBottom: 12 }} />
            <ListItemSkeleton style={{ marginBottom: 12 }} />
            <ListItemSkeleton style={{ marginBottom: 12 }} />
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
              <Text style={styles.navTitle}>Edit Item</Text>
              <TouchableOpacity onPress={handleDelete} disabled={deleting}>
                <Ionicons name="trash-outline" size={22} color={Colors.error} />
              </TouchableOpacity>
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
              <GlassInput label="Price per unit (CAD $)" value={priceStr} onChangeText={setPriceStr} keyboardType="decimal-pad" containerStyle={styles.input} />
              <GlassInput label="Lead time (days)" value={leadTime} onChangeText={setLeadTime} keyboardType="numeric" containerStyle={styles.input} />
            </GlassCard>

            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.chipGrid}>
              {availableCategories.map((c) => (
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

            <GlassButton label="Save Changes" onPress={handleSave} loading={saving} fullWidth size="lg" style={{ marginTop: Spacing.lg }} />
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
  chipActive: { borderColor: Colors.success, backgroundColor: 'rgba(255,107,0,0.12)' },
  chipText: { fontSize: 13, color: Colors.text.secondary },
  chipTextActive: { color: Colors.text.primary, fontWeight: '600' },
});
