import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GradientBackground } from '@/components/ui';
import type { Supplier, SupplierCatalogItem } from '@/types/database.types';
import { nextCatalogSetupRoute } from '@/lib/supplier-catalog';

export default function SupplierCatalog() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [items, setItems] = useState<SupplierCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasSupplierProfile, setHasSupplierProfile] = useState(false);
  const [setupRoute, setSetupRoute] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) {
      setItems([]);
      setHasSupplierProfile(false);
      setSetupRoute('SupplierBusinessOnboarding');
      setErrorMessage('You need to be signed in to manage your catalog.');
      setLoading(false);
      return;
    }

    setErrorMessage(null);
    const { data: sup, error: supplierError } = await supabase
      .from('suppliers')
      .select('id, license_number, categories')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (supplierError) {
      setItems([]);
      setHasSupplierProfile(false);
      setSetupRoute(null);
      setErrorMessage(supplierError.message);
      setLoading(false);
      return;
    }
    if (!sup) {
      setItems([]);
      setHasSupplierProfile(false);
      setSetupRoute('SupplierBusinessOnboarding');
      setLoading(false);
      return;
    }

    setHasSupplierProfile(true);
    setSetupRoute(nextCatalogSetupRoute(sup as Pick<Supplier, 'categories' | 'license_number'>));
    const { data, error } = await supabase
      .from('supplier_catalog')
      .select('*')
      .eq('supplier_id', sup.id)
      .order('created_at', { ascending: false });
    if (error) {
      setItems([]);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setItems((data as SupplierCatalogItem[]) ?? []);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false); };

  const openAddItem = () => {
    navigation.navigate(setupRoute ?? 'SupplierAddCatalogItem');
  };

  const toggleStock = async (item: SupplierCatalogItem) => {
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, in_stock: !i.in_stock } : i));
    const { data, error } = await supabase
      .from('supplier_catalog')
      .update({ in_stock: !item.in_stock })
      .eq('id', item.id)
      .select('id')
      .maybeSingle();
    if (error) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, in_stock: item.in_stock } : i));
      Alert.alert('Could not update stock', error.message);
    } else if (!data) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, in_stock: item.in_stock } : i));
      Alert.alert('Could not update stock', 'This catalog item is no longer available.');
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Catalog</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openAddItem} activeOpacity={0.8}>
            <Ionicons name={setupRoute ? 'arrow-forward' : 'add'} size={20} color="#fff" />
            <Text style={styles.addBtnText}>{setupRoute ? 'Setup' : 'Add Item'}</Text>
          </TouchableOpacity>
        </View>

        {errorMessage ? (
          <View style={styles.empty}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>Could not load catalog</Text>
            <Text style={styles.emptyBody}>{errorMessage}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={fetchData} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : !hasSupplierProfile || setupRoute ? (
          <View style={styles.empty}>
            <Ionicons name="storefront-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>{hasSupplierProfile ? 'Finish supplier setup' : 'Set up your supplier profile'}</Text>
            <Text style={styles.emptyBody}>
              Complete your supplier profile, license, and supply categories before adding catalog items.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAddItem} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>{hasSupplierProfile ? 'Continue Setup' : 'Start Setup'}</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="storefront-outline" size={48} color={Colors.text.tertiary} />
            <Text style={styles.emptyTitle}>No catalog items</Text>
            <Text style={styles.emptyBody}>Add the materials you carry so homeowners and the platform know what you supply.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('SupplierAddCatalogItem')} activeOpacity={0.8}>
              <Text style={styles.emptyBtnText}>Add First Item</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.itemCard}
                onPress={() => navigation.navigate('SupplierEditCatalogItem', { itemId: item.id })}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.category} • {item.brand ?? 'No brand'} • {item.quality_tier}</Text>
                  <Text style={styles.itemPrice}>${(item.price_per_unit / 100).toFixed(2)} / {item.unit}</Text>
                </View>
                <View style={styles.itemRight}>
                  <Switch
                    value={item.in_stock}
                    onValueChange={() => toggleStock(item)}
                    trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(52,211,153,0.4)' }}
                    thumbColor={item.in_stock ? '#34D399' : 'rgba(255,255,255,0.4)'}
                  />
                  <Text style={[styles.stockLabel, { color: item.in_stock ? '#34D399' : Colors.text.tertiary }]}>
                    {item.in_stock ? 'In stock' : 'Out'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  headerTitle: { ...Typography.h2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  list: { paddingHorizontal: Spacing.md, paddingBottom: 100, gap: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: Spacing.xl },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center' },
  emptyBtn: { backgroundColor: Colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.item, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: Spacing.md },
  itemName: { fontSize: 15, fontWeight: '700', color: Colors.text.primary, marginBottom: 3 },
  itemMeta: { fontSize: 12, color: Colors.text.tertiary, marginBottom: 4 },
  itemPrice: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  itemRight: { alignItems: 'center', gap: 4 },
  stockLabel: { fontSize: 11, fontWeight: '600' },
});
