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
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';
import { AddressAutocomplete, type AddressResult } from '@/components/ui/AddressAutocomplete';
import { normalizeCanadianProvince } from '@/lib/canada';

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

function withoutKeys<T extends Record<string, unknown>>(payload: T, keys: string[]) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !keys.includes(key)));
}

function parseWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export default function SupplierBusinessOnboarding() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [serviceRadius, setServiceRadius] = useState('100');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAddressSelect = (result: AddressResult) => {
    setAddress(result.street || result.fullAddress);
    setCity(result.city);
    setProvince(normalizeCanadianProvince(result.province));
    setPostalCode(result.postalCode);
    setLat(result.lat ?? null);
    setLng(result.lng ?? null);
  };

  const clearSelectedCoordinates = () => {
    setLat(null);
    setLng(null);
  };

  const handleNext = async () => {
    if (!businessName.trim() || !city.trim() || !province.trim()) {
      Alert.alert('Required', 'Please fill in business name, city, and province.');
      return;
    }
    const provinceCode = normalizeCanadianProvince(province);
    if (!provinceCode) {
      Alert.alert('Invalid province', 'Use a valid Canadian province or territory code, such as ON, BC, or AB.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('Delivery location required', 'Select your business address from the address search so WalkerAI can match material orders near you.');
      return;
    }
    const radius = parseWholeNumber(serviceRadius);
    if (radius == null || radius < 10 || radius > 1000) {
      Alert.alert('Invalid radius', 'Service radius must be between 10 and 1000 km.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before continuing supplier onboarding.');
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
        service_radius_km: radius,
        lat,
        lng,
        verified: false,
      };

      const { data: existingSupplier, error: existingError } = await supabase
        .from('suppliers')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      let saveQuery = existingSupplier?.id
        ? supabase.from('suppliers').update(payload).eq('id', existingSupplier.id)
        : supabase.from('suppliers').insert(payload);
      let { data, error } = await saveQuery.select('id').maybeSingle();

      if (isMissingColumnError(error)) {
        const legacyPayload = withoutKeys(payload, ['lat', 'lng']);
        saveQuery = existingSupplier?.id
          ? supabase.from('suppliers').update(legacyPayload).eq('id', existingSupplier.id)
          : supabase.from('suppliers').insert(legacyPayload);
        const legacyResult = await saveQuery.select('id').maybeSingle();
        data = legacyResult.data;
        error = legacyResult.error;
      }

      if (error) throw error;
      if (!data) throw new Error('Supplier profile was not saved.');
      navigation.navigate('SupplierLicenseOnboarding');
    } catch (err) {
      Alert.alert('Could not save business info', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>

            <View style={styles.stepRow}>
              {[1, 2, 3].map((s) => (
                <View key={s} style={[styles.stepDot, s === 1 && styles.stepDotActive]} />
              ))}
            </View>

            <Text style={styles.title}>Business Info</Text>
            <Text style={styles.subtitle}>Tell us about your supply business</Text>

            <GlassCard style={styles.card} padding={Spacing.md}>
              <GlassInput label="Business Name" value={businessName} onChangeText={setBusinessName} autoCapitalize="words" containerStyle={styles.input} />
              <AddressAutocomplete
                placeholder="Search business address"
                initialValue={address}
                onSelect={handleAddressSelect}
                onClearSelection={clearSelectedCoordinates}
                containerStyle={styles.input}
              />
              <View style={styles.row}>
                <GlassInput
                  label="City"
                  value={city}
                  onChangeText={(value) => {
                    setCity(value);
                    clearSelectedCoordinates();
                  }}
                  autoCapitalize="words"
                  containerStyle={[styles.input, { flex: 1 }]}
                />
                <GlassInput
                  label="Province"
                  value={province}
                  onChangeText={(value) => {
                    setProvince(value);
                    clearSelectedCoordinates();
                  }}
                  autoCapitalize="characters"
                  maxLength={2}
                  containerStyle={[styles.input, { width: 80 }]}
                />
              </View>
              <GlassInput
                label="Postal Code (optional)"
                value={postalCode}
                onChangeText={(value) => {
                  setPostalCode(value);
                  clearSelectedCoordinates();
                }}
                autoCapitalize="characters"
                containerStyle={styles.input}
              />
              <GlassInput
                label="Service Radius (km)"
                value={serviceRadius}
                onChangeText={setServiceRadius}
                keyboardType="numeric"
                containerStyle={styles.input}
              />
              <Text style={styles.hint}>How far can you deliver materials from your location?</Text>
            </GlassCard>

            <GlassButton label="Next — License" onPress={handleNext} loading={loading} fullWidth size="lg" style={styles.btn} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  back: { marginBottom: Spacing.md },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.lg },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  stepDotActive: { backgroundColor: Colors.accent, width: 24 },
  title: { ...Typography.h1, marginBottom: 6 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  card: { marginBottom: Spacing.lg },
  input: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: 10 },
  hint: { fontSize: 12, color: Colors.text.tertiary, marginTop: 4 },
  btn: { marginTop: 4 },
});
