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
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';
import { AddressAutocomplete, type AddressResult } from '@/components/ui/AddressAutocomplete';
import { normalizeCanadianProvince } from '@/lib/canada';

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message;
  if (!message) return false;
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
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

const TRADE_OPTIONS = [
  { value: 'plumber', label: 'Plumbing' },
  { value: 'electrician', label: 'Electrical' },
  { value: 'tile_installer', label: 'Tile' },
  { value: 'cabinet_installer', label: 'Cabinets' },
  { value: 'painter', label: 'Painting' },
  { value: 'flooring_installer', label: 'Flooring' },
  { value: 'drywall', label: 'Drywall' },
  { value: 'demolition', label: 'Demolition' },
] as const;

type TradeType = typeof TRADE_OPTIONS[number]['value'];

export default function BusinessOnboardingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [serviceRadius, setServiceRadius] = useState('50');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [selectedTrades, setSelectedTrades] = useState<TradeType[]>(['plumber']);
  const [loading, setLoading] = useState(false);

  const toggleTrade = (trade: TradeType) => {
    setSelectedTrades((current) => {
      if (current.includes(trade)) {
        return current.filter((item) => item !== trade);
      }
      return [...current, trade];
    });
  };

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
    if (!companyName.trim() || !city.trim() || !province.trim()) {
      Alert.alert('Required fields', 'Please fill in your company name, city, and province.');
      return;
    }
    const provinceCode = normalizeCanadianProvince(province);
    if (!provinceCode) {
      Alert.alert('Invalid province', 'Use a valid Canadian province or territory code, such as ON, BC, or AB.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('Service location required', 'Select your business address from the address search so WalkerAI can match jobs near you.');
      return;
    }
    if (selectedTrades.length === 0) {
      Alert.alert('Trade required', 'Select at least one service your company can take.');
      return;
    }
    const radiusKm = parseWholeNumber(serviceRadius);
    if (radiusKm == null || radiusKm < 10 || radiusKm > 500) {
      Alert.alert('Invalid radius', 'Service radius must be between 10 and 500 km.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before continuing contractor onboarding.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        user_id: user.id,
        name: companyName.trim(),
        address: address.trim() || null,
        city: city.trim(),
        province: provinceCode,
        postal_code: postalCode.trim() || null,
        service_radius_km: radiusKm,
        lat,
        lng,
        trade_types: selectedTrades,
        primary_trade: selectedTrades[0],
      };

      const { data: existingCompany, error: existingError } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingError) throw existingError;

      let saveQuery = existingCompany?.id
        ? supabase.from('companies').update(payload).eq('id', existingCompany.id)
        : supabase.from('companies').insert(payload);
      let { data, error } = await saveQuery.select('id').maybeSingle();

      if (isMissingColumnError(error)) {
        const legacyPayload = withoutKeys(payload, ['lat', 'lng', 'trade_types', 'primary_trade']);
        saveQuery = existingCompany?.id
          ? supabase.from('companies').update(legacyPayload).eq('id', existingCompany.id)
          : supabase.from('companies').insert(legacyPayload);
        const legacyResult = await saveQuery.select('id').maybeSingle();
        data = legacyResult.data;
        error = legacyResult.error;
      }

      if (error) throw error;
      if (!data) throw new Error('Company profile was not saved.');
      navigation.navigate('LicenseOnboarding');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>

            {/* Progress */}
            <View style={styles.progressRow}>
              {[1, 2, 3].map((step) => (
                <View
                  key={step}
                  style={[styles.progressDot, step === 1 && styles.progressDotActive]}
                />
              ))}
            </View>

            <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
            <Text style={styles.title}>Business info</Text>
            <Text style={styles.subtitle}>
              Tell us about your contracting business.
            </Text>

            <GlassCard style={styles.card}>
              <GlassInput
                label="Company Name"
                value={companyName}
                onChangeText={setCompanyName}
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
                hint="Jobs within this distance will be dispatched to you."
              />

              <View style={styles.tradeSection}>
                <Text style={styles.tradeLabel}>Services you accept</Text>
                <Text style={styles.tradeHint}>
                  Project invites use these trades to match the right companies.
                </Text>
                <View style={styles.tradeGrid}>
                  {TRADE_OPTIONS.map((trade) => {
                    const selected = selectedTrades.includes(trade.value);
                    return (
                      <TouchableOpacity
                        key={trade.value}
                        style={[styles.tradeChip, selected && styles.tradeChipActive]}
                        onPress={() => toggleTrade(trade.value)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={selected ? Colors.success : Colors.text.tertiary}
                        />
                        <Text style={[styles.tradeChipText, selected && styles.tradeChipTextActive]}>
                          {trade.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </GlassCard>

            <GlassButton
              label="Continue"
              onPress={handleNext}
              loading={loading}
              fullWidth
              size="lg"
              style={styles.cta}
            />
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
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: Spacing.lg,
  },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.glass.surface,
  },
  progressDotActive: {
    backgroundColor: Colors.success,
  },
  stepLabel: { ...Typography.label, color: Colors.success, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg },
  card: { marginBottom: Spacing.md },
  row: { flexDirection: 'row' },
  inputSpacing: { marginBottom: Spacing.sm },
  cityInput: { flex: 1, marginRight: 8 },
  provinceInput: { width: 80 },
  tradeSection: { marginTop: Spacing.xs },
  tradeLabel: { ...Typography.label, color: Colors.text.primary, marginBottom: 4 },
  tradeHint: { ...Typography.caption, color: Colors.text.secondary, marginBottom: Spacing.sm },
  tradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.glass.surface,
  },
  tradeChipActive: {
    borderColor: 'rgba(34,197,94,0.55)',
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  tradeChipText: { color: Colors.text.secondary, fontSize: 13, fontWeight: '600' },
  tradeChipTextActive: { color: Colors.text.primary },
  cta: { marginTop: Spacing.xs },
});
