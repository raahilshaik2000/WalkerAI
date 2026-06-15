import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { AddressAutocomplete, type AddressResult } from '@/components/ui/AddressAutocomplete';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';
import { normalizeCanadianProvince } from '@/lib/canada';

function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parsePercent(value: string): number | null {
  const normalized = value.trim().replace('%', '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function GeneralContractorBusinessOnboarding() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuthStore();
  const returnToProfile = route.params?.returnToProfile === true;
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [serviceRadius, setServiceRadius] = useState('100');
  const [defaultMarkup, setDefaultMarkup] = useState('15');
  const [conciergeFee, setConciergeFee] = useState('10');
  const [conciergeEnabled, setConciergeEnabled] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const clearSelectedCoordinates = () => {
    setLat(null);
    setLng(null);
  };

  const handleAddressSelect = (result: AddressResult) => {
    setAddress(result.street || result.fullAddress);
    setCity(result.city);
    setProvince(normalizeCanadianProvince(result.province));
    setPostalCode(result.postalCode);
    setLat(result.lat ?? null);
    setLng(result.lng ?? null);
  };

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    const loadExistingProfile = async () => {
      const { data, error } = await supabase
        .from('general_contractors')
        .select(`
          business_name, address, city, province, postal_code, service_radius_km,
          default_markup_pct, default_concierge_fee_pct, concierge_enabled, lat, lng
        `)
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled || error || !data) return;
      setBusinessName(data.business_name ?? '');
      setAddress(data.address ?? '');
      setCity(data.city ?? '');
      setProvince(data.province ?? '');
      setPostalCode(data.postal_code ?? '');
      setServiceRadius(data.service_radius_km != null ? String(data.service_radius_km) : '100');
      setDefaultMarkup(data.default_markup_pct != null ? Number(data.default_markup_pct).toFixed(0) : '15');
      setConciergeFee(data.default_concierge_fee_pct != null ? Number(data.default_concierge_fee_pct).toFixed(0) : '10');
      setConciergeEnabled(data.concierge_enabled === true);
      setLat(data.lat ?? null);
      setLng(data.lng ?? null);
    };

    loadExistingProfile().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleNext = async () => {
    if (!businessName.trim() || !city.trim() || !province.trim()) {
      Alert.alert('Required fields', 'Enter your business name, city, and province.');
      return;
    }
    const provinceCode = normalizeCanadianProvince(province);
    if (!provinceCode) {
      Alert.alert('Invalid province', 'Use a valid Canadian province or territory code, such as ON, BC, or AB.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('Service location required', 'Select your business address from search so WalkerAI can match projects near you.');
      return;
    }
    const radiusKm = parseWholeNumber(serviceRadius);
    if (radiusKm == null || radiusKm < 10 || radiusKm > 500) {
      Alert.alert('Invalid radius', 'Service radius must be between 10 and 500 km.');
      return;
    }
    const markupPct = parsePercent(defaultMarkup);
    if (markupPct == null || markupPct < 0 || markupPct > 50) {
      Alert.alert('Invalid markup', 'Default markup must be between 0% and 50%.');
      return;
    }
    const conciergePct = parsePercent(conciergeFee);
    if (conciergePct == null || conciergePct < 0 || conciergePct > 25) {
      Alert.alert('Invalid concierge fee', 'Default concierge fee must be between 0% and 25%.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before continuing.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        user_id: user.id,
        business_name: businessName.trim(),
        address: address.trim() || null,
        city: city.trim(),
        province: provinceCode,
        postal_code: postalCode.trim() || null,
        service_radius_km: radiusKm,
        lat,
        lng,
        default_markup_pct: markupPct,
        default_concierge_fee_pct: conciergePct,
        concierge_enabled: conciergeEnabled,
      };

      const { data: existing, error: existingError } = await supabase
        .from('general_contractors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existingError) throw existingError;

      const saveQuery = existing?.id
        ? supabase.from('general_contractors').update(payload).eq('id', existing.id)
        : supabase.from('general_contractors').insert(payload);
      const { data, error } = await saveQuery.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('General contractor profile was not saved.');
      if (returnToProfile) {
        navigation.navigate('GeneralContractorTabs', { screen: 'GeneralContractorProfile' });
      } else {
        navigation.navigate('GeneralContractorLicenseOnboarding');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>

            <View style={styles.progressRow}>
              {[1, 2, 3].map((step) => (
                <View key={step} style={[styles.progressDot, step === 1 && styles.progressDotActive]} />
              ))}
            </View>

            <Text style={styles.stepLabel}>{returnToProfile ? 'PROFILE SETTINGS' : 'STEP 1 OF 3'}</Text>
            <Text style={styles.title}>{returnToProfile ? 'Edit GC profile' : 'GC profile'}</Text>
            <Text style={styles.subtitle}>
              {returnToProfile
                ? 'Update your business details and default project management terms.'
                : 'Set up your project management and concierge account.'}
            </Text>

            <GlassCard style={styles.card}>
              <GlassInput
                label="Business Name"
                value={businessName}
                onChangeText={setBusinessName}
                autoCorrect={false}
                containerStyle={styles.inputSpacing}
              />

              <AddressAutocomplete
                placeholder="Search business address"
                initialValue={address}
                onSelect={handleAddressSelect}
                onClearSelection={clearSelectedCoordinates}
                containerStyle={styles.inputSpacing}
              />

              <View style={styles.row}>
                <GlassInput
                  label="City"
                  value={city}
                  onChangeText={(value) => {
                    setCity(value);
                    clearSelectedCoordinates();
                  }}
                  autoCorrect={false}
                  containerStyle={[styles.inputSpacing, styles.cityInput]}
                />
                <GlassInput
                  label="Province"
                  value={province}
                  onChangeText={(value) => {
                    setProvince(value);
                    clearSelectedCoordinates();
                  }}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  maxLength={2}
                  containerStyle={[styles.inputSpacing, styles.provinceInput]}
                />
              </View>

              <GlassInput
                label="Postal Code (optional)"
                value={postalCode}
                onChangeText={(value) => {
                  setPostalCode(value);
                  clearSelectedCoordinates();
                }}
                autoCorrect={false}
                autoCapitalize="characters"
                maxLength={7}
                containerStyle={styles.inputSpacing}
              />

              <GlassInput
                label="Service Radius (km)"
                value={serviceRadius}
                onChangeText={setServiceRadius}
                keyboardType="number-pad"
                containerStyle={styles.inputSpacing}
                hint="Projects within this distance can be matched to you."
              />

              <View style={styles.row}>
                <GlassInput
                  label="Markup %"
                  value={defaultMarkup}
                  onChangeText={setDefaultMarkup}
                  keyboardType="decimal-pad"
                  containerStyle={[styles.inputSpacing, styles.percentInput]}
                />
                <GlassInput
                  label="Concierge %"
                  value={conciergeFee}
                  onChangeText={setConciergeFee}
                  keyboardType="decimal-pad"
                  containerStyle={[styles.inputSpacing, styles.percentInput]}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleBody}>
                  <Text style={styles.toggleTitle}>Concierge marketplace</Text>
                  <Text style={styles.toggleSub}>
                    Allow homeowners to book paid consultations and full concierge services.
                  </Text>
                </View>
                <Switch
                  value={conciergeEnabled}
                  onValueChange={setConciergeEnabled}
                  trackColor={{ false: Colors.surface.border, true: 'rgba(255,107,0,0.45)' }}
                  thumbColor={conciergeEnabled ? Colors.accent : Colors.text.tertiary}
                />
              </View>
            </GlassCard>

            <GlassButton label={returnToProfile ? 'Save Changes' : 'Continue'} onPress={handleNext} loading={loading} fullWidth size="lg" />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  backButton: { marginBottom: Spacing.sm },
  progressRow: { flexDirection: 'row', gap: 4, marginBottom: Spacing.lg },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.glass.surface,
  },
  progressDotActive: { backgroundColor: Colors.success },
  stepLabel: { ...Typography.label, color: Colors.success, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  card: { marginBottom: Spacing.md },
  row: { flexDirection: 'row', gap: 8 },
  inputSpacing: { marginBottom: Spacing.sm },
  cityInput: { flex: 1 },
  provinceInput: { width: 86 },
  percentInput: { flex: 1 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.glass.border,
  },
  toggleBody: { flex: 1 },
  toggleTitle: { ...Typography.body, fontWeight: '800', marginBottom: 3 },
  toggleSub: { ...Typography.caption, lineHeight: 18 },
});
