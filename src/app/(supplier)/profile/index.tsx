import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/lib/supabase/auth';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { isStripePayoutLocallyReady } from '@/lib/payouts';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing } from '@/constants/theme';
import { GlassCard, GradientBackground } from '@/components/ui';
import type { Supplier } from '@/types/database.types';

function supplierCategories(supplier: Supplier): string[] {
  return Array.isArray(supplier.categories) ? supplier.categories : [];
}

function nextSupplierOnboardingRoute(supplier: Supplier | null): string | null {
  if (!supplier) return 'SupplierBusinessOnboarding';
  if (!supplier.license_number) return 'SupplierLicenseOnboarding';
  if (supplierCategories(supplier).length === 0) return 'SupplierCategoriesOnboarding';
  return null;
}

export default function SupplierProfile() {
  const navigation = useNavigation<any>();
  const { user, clearSession } = useAuthStore();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSupplierProfile = useCallback(async ({ showSpinner = false } = {}) => {
    if (showSpinner) setLoading(true);
    try {
      const currentUserId = user?.id ?? (await getCurrentUser())?.id ?? null;
      if (!currentUserId) {
        setSupplier(null);
        setErrorMessage('You need to be signed in to view your supplier profile.');
        return;
      }
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        setSupplier(null);
        setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load supplier profile.'));
        return;
      }
      setSupplier(data);
      setErrorMessage(null);
    } catch (err) {
      setSupplier(null);
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load supplier profile.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadSupplierProfile({ showSpinner: true });
    }, [loadSupplierProfile])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadSupplierProfile();
    });
    return () => subscription.remove();
  }, [loadSupplierProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSupplierProfile();
  };

  const signOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); clearSession(); } },
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  const payoutReady = isStripePayoutLocallyReady(supplier);
  const setupRoute = nextSupplierOnboardingRoute(supplier);

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          {errorMessage ? (
            <GlassCard style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Profile unavailable</Text>
              <Text style={styles.emptyBody}>{errorMessage}</Text>
              <TouchableOpacity style={styles.setupBtn} onPress={() => loadSupplierProfile({ showSpinner: true })} activeOpacity={0.8}>
                <Text style={styles.setupBtnText}>Try Again</Text>
              </TouchableOpacity>
            </GlassCard>
          ) : !supplier ? (
            <GlassCard style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Supplier setup</Text>
              <Text style={styles.emptyBody}>Create your supplier profile before managing orders, catalog items, or payouts.</Text>
              <TouchableOpacity style={styles.setupBtn} onPress={() => navigation.navigate('SupplierBusinessOnboarding')} activeOpacity={0.8}>
                <Text style={styles.setupBtnText}>Start Setup</Text>
              </TouchableOpacity>
            </GlassCard>
          ) : null}

          {/* Avatar & name */}
          {supplier && <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{supplier?.business_name?.[0]?.toUpperCase() ?? 'S'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{supplier?.business_name ?? 'Supplier'}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              {supplier?.verified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#34D399" />
                  <Text style={styles.verifiedText}>Verified Supplier</Text>
                </View>
              ) : setupRoute ? (
                <TouchableOpacity
                  style={styles.continueSetupBtn}
                  onPress={() => navigation.navigate(setupRoute)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueSetupText}>Continue Setup</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.pendingBadge}>
                  <Ionicons name="time-outline" size={14} color={Colors.accent} />
                  <Text style={styles.pendingText}>Pending Verification</Text>
                </View>
              )}
            </View>
          </View>}

          {/* Stats */}
          {supplier?.verified && (
            <View style={styles.statsRow}>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{supplier.rating?.toFixed(1) ?? '—'}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Rating</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{supplier.total_reviews}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Reviews</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{supplier.fulfillment_rate != null ? `${supplier.fulfillment_rate.toFixed(0)}%` : '—'}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>On-time</Text>
              </GlassCard>
              <GlassCard style={styles.statCard}>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{supplier.avg_delivery_days ?? '—'}</Text>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Avg days</Text>
              </GlassCard>
            </View>
          )}

          {/* Business info */}
          {supplier && <GlassCard style={styles.infoCard}>
            <Text style={styles.sectionTitle}>Business Details</Text>
            <InfoRow icon="location-outline" label={`${supplier?.city ?? ''}, ${supplier?.province ?? ''}`} />
            <InfoRow icon="radio-outline" label={`${supplier?.service_radius_km ?? 100} km service radius`} />
            {supplier?.license_number && <InfoRow icon="document-outline" label={`License: ${supplier.license_number}`} />}
            <InfoRow
              icon={payoutReady ? 'card-outline' : 'alert-circle-outline'}
              label={payoutReady
                ? 'Stripe payouts active'
                : supplier.stripe_account_id
                ? 'Stripe onboarding incomplete'
                : 'Stripe payouts not connected'}
            />
          </GlassCard>}

          {/* Categories */}
          {supplier?.categories && supplier.categories.length > 0 && (
            <GlassCard style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Supply Categories</Text>
              <View style={styles.catWrap}>
                {supplier.categories.map((c) => (
                  <View key={c} style={styles.catChip}>
                    <Text style={styles.catChipText}>{c}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          )}

          <TouchableOpacity style={styles.signOutBtn} onPress={signOut} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={18} color="#FF4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function InfoRow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={irStyles.row}>
      <Ionicons name={icon} size={16} color={Colors.text.tertiary} />
      <Text style={irStyles.text}>{label}</Text>
    </View>
  );
}

const irStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  text: { fontSize: 14, color: Colors.text.secondary },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 100, gap: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,107,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.accent },
  name: { fontSize: 20, fontWeight: '800', color: Colors.text.primary },
  email: { fontSize: 13, color: Colors.text.tertiary, marginTop: 2 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  verifiedText: { fontSize: 12, color: '#34D399', fontWeight: '600' },
  pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  pendingText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { width: '48.5%', minHeight: 64, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 3 },
  statValue: { fontSize: 15, fontWeight: '800', color: Colors.text.primary, textAlign: 'center', width: '100%' },
  statLabel: { fontSize: 11, color: Colors.text.tertiary, textAlign: 'center', width: '100%' },
  infoCard: { padding: Spacing.md, gap: 2 },
  sectionTitle: { fontSize: 12, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  emptyBody: { fontSize: 14, color: Colors.text.secondary, lineHeight: 20 },
  setupBtn: { alignSelf: 'flex-start', backgroundColor: Colors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, marginTop: 12 },
  setupBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  continueSetupBtn: { alignSelf: 'flex-start', backgroundColor: Colors.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginTop: 8 },
  continueSetupText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  catWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  catChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,107,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,107,0,0.3)' },
  catChipText: { fontSize: 12, color: Colors.accent, fontWeight: '600' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, justifyContent: 'center', marginTop: 8 },
  signOutText: { fontSize: 15, color: '#FF4444', fontWeight: '600' },
});
