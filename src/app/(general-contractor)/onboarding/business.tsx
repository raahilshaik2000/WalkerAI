import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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
  const { user } = useAuthStore();
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [serviceRadius, setServiceRadius] = useState('100');
  const [defaultMarkup, setDefaultMarkup] = useState('15');
  const [conciergeFee, setConciergeFee] = useState('10');
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
        concierge_enabled: true,
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
      navigation.navigate('GeneralContractorLicenseOnboarding');
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

            <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
            <Text style={styles.title}>GC profile</Text>
            <Text style={styles.subtitle}>
              Set up your project management and concierge account.
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
            </GlassCard>

            <GlassButton label="Continue" onPress={handleNext} loading={loading} fullWidth size="lg" />
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
});
