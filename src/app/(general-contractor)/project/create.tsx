import { useEffect, useState } from 'react';
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
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { AddressAutocomplete, type AddressResult } from '@/components/ui/AddressAutocomplete';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';
import { normalizeCanadianProvince } from '@/lib/canada';
import { nextGeneralContractorOnboardingRoute } from '@/lib/general-contractor';
import type { GeneralContractor } from '@/types/database.types';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GC_PROJECT_TYPES, type GeneralContractorProjectType } from '@/constants/enums';

function parsePercent(value: string, fallback: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.replace('%', '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function projectTypeLabel(type: GeneralContractorProjectType) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatPercentInput(value: number | null | undefined, fallback: number) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return String(fallback);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export default function GeneralContractorCreateProject() {
  const navigation = useNavigation<any>();
  const [homeownerEmail, setHomeownerEmail] = useState('');
  const [homeownerName, setHomeownerName] = useState('');
  const [homeownerPhone, setHomeownerPhone] = useState('');
  const [projectType, setProjectType] = useState<GeneralContractorProjectType>('kitchen');
  const [scopeSummary, setScopeSummary] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [markupPct, setMarkupPct] = useState('15');
  const [conciergeFeePct, setConciergeFeePct] = useState('10');
  const [profileReady, setProfileReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadGcDefaults() {
      setProfileLoading(true);
      setProfileReady(false);
      try {
        const currentUser = (await supabase.auth.getUser()).data.user;
        if (!currentUser?.id) {
          if (!cancelled) {
            Alert.alert('Sign in required', 'Please sign in again before creating managed projects.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          }
          return;
        }

        const { data, error } = await supabase
          .from('general_contractors')
          .select('business_name, city, province, lat, lng, license_number, license_doc_url, insurance_doc_url, verified, default_markup_pct, default_concierge_fee_pct')
          .eq('user_id', currentUser.id)
          .maybeSingle();
        if (error) throw error;

        if (cancelled) return;
        const gc = data as Pick<
          GeneralContractor,
          'business_name' | 'city' | 'province' | 'lat' | 'lng' | 'license_number' | 'license_doc_url' | 'insurance_doc_url' | 'verified' | 'default_markup_pct' | 'default_concierge_fee_pct'
        > | null;
        const setupRoute = nextGeneralContractorOnboardingRoute(gc);
        if (!gc || setupRoute || gc.verified !== true) {
          Alert.alert(
            setupRoute ? 'Finish GC setup' : 'GC verification required',
            setupRoute
              ? 'Complete your GC setup before creating managed projects.'
              : 'WalkerAI must verify your GC profile before you can create managed projects.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
          return;
        }

        setMarkupPct(formatPercentInput(gc.default_markup_pct, 15));
        setConciergeFeePct(formatPercentInput(gc.default_concierge_fee_pct, 10));
        setProfileReady(true);
      } catch (err) {
        if (!cancelled) {
          Alert.alert('Could not load GC profile', err instanceof Error ? err.message : 'Please try again.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    loadGcDefaults();

    return () => {
      cancelled = true;
    };
  }, [navigation]);

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

  const handleCreate = async () => {
    if (!profileReady) {
      Alert.alert('GC profile required', 'Your verified GC profile must load before creating managed projects.');
      return;
    }
    const normalizedEmail = homeownerEmail.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Homeowner email required', 'Enter the email for an existing homeowner account.');
      return;
    }
    const contactName = homeownerName.trim();
    if (!contactName) {
      Alert.alert('Homeowner name required', 'Add the homeowner name for this managed project.');
      return;
    }
    const contactPhone = homeownerPhone.trim();
    if (!scopeSummary.trim()) {
      Alert.alert('Scope required', 'Add a short scope summary for the homeowner.');
      return;
    }
    const provinceCode = normalizeCanadianProvince(province);
    if (!address.trim() || !city.trim() || !provinceCode) {
      Alert.alert('Project address required', 'Select the project address and confirm city/province.');
      return;
    }
    if (lat == null || lng == null) {
      Alert.alert('Map location required', 'Select the address from search so the project has coordinates.');
      return;
    }
    const parsedMarkup = parsePercent(markupPct, 15);
    if (parsedMarkup == null || parsedMarkup < 0 || parsedMarkup > 50) {
      Alert.alert('Invalid management allowance', 'Management allowance must be between 0% and 50%.');
      return;
    }
    const parsedConcierge = parsePercent(conciergeFeePct, 10);
    if (parsedConcierge == null || parsedConcierge < 0 || parsedConcierge > 25) {
      Alert.alert('Invalid concierge allowance', 'Concierge allowance must be between 0% and 25%.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_gc_managed_project', {
        p_homeowner_email: normalizedEmail,
        p_address: address.trim(),
        p_city: city.trim(),
        p_province: provinceCode,
        p_postal_code: postalCode.trim() || null,
        p_lat: lat,
        p_lng: lng,
        p_room_type: projectType,
        p_scope_summary: scopeSummary.trim(),
        p_markup_pct: parsedMarkup,
        p_concierge_fee_pct: parsedConcierge,
        p_homeowner_contact_name: contactName,
        p_homeowner_contact_phone: contactPhone || null,
      });
      if (error) throw error;
      if (!data || typeof data !== 'string') throw new Error('Project was not created.');

      Alert.alert(
        'Project created',
        'The homeowner owns this draft and must confirm GC management before recommendations can be sent.',
        [{ text: 'Open Project', onPress: () => navigation.replace('GeneralContractorProjectDetail', { id: data }) }],
      );
    } catch (err) {
      Alert.alert('Could not create project', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Icon name="arrow-left" size={22} color={Colors.text.secondary} />
              </TouchableOpacity>
              <View style={styles.headerBody}>
                <Text style={styles.title}>Create managed project</Text>
                <Text style={styles.subtitle}>Start a homeowner-owned draft project and request GC management approval.</Text>
              </View>
            </View>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Homeowner</Text>
              <GlassInput
                label="Existing homeowner email"
                value={homeownerEmail}
                onChangeText={setHomeownerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                hint="For now, the homeowner must already have a WalkerAI homeowner account."
                containerStyle={styles.inputSpacing}
              />
              <GlassInput
                label="Homeowner name"
                value={homeownerName}
                onChangeText={setHomeownerName}
                autoCapitalize="words"
                containerStyle={styles.inputSpacing}
              />
              <GlassInput
                label="Homeowner phone"
                value={homeownerPhone}
                onChangeText={setHomeownerPhone}
                keyboardType="phone-pad"
                hint="Optional, used only as project contact context."
                containerStyle={styles.inputSpacing}
              />

              <Text style={styles.sectionTitle}>Project type</Text>
              <View style={styles.segmentRow}>
                {GC_PROJECT_TYPES.map((type) => {
                  const selected = projectType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.segment, selected && styles.segmentActive]}
                      onPress={() => setProjectType(type)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                        {projectTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <GlassInput
                label="Scope summary"
                value={scopeSummary}
                onChangeText={setScopeSummary}
                containerStyle={styles.inputSpacing}
                hint="Example: Full bathroom remodel, flooring replacement, basement finishing, or painting scope."
              />
            </GlassCard>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Project address</Text>
              <AddressAutocomplete
                placeholder="Search project address"
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
                  containerStyle={[styles.inputSpacing, styles.cityInput]}
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
                  containerStyle={[styles.inputSpacing, styles.provinceInput]}
                />
              </View>
              <GlassInput
                label="Postal Code"
                value={postalCode}
                onChangeText={(value) => {
                  setPostalCode(value);
                  clearSelectedCoordinates();
                }}
                autoCapitalize="characters"
              />
            </GlassCard>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Project terms</Text>
              {profileLoading ? (
                <Text style={styles.note}>Loading your default GC terms...</Text>
              ) : null}
              <View style={styles.row}>
                <GlassInput
                  label="Management allowance"
                  value={markupPct}
                  onChangeText={setMarkupPct}
                  keyboardType="decimal-pad"
                  containerStyle={styles.halfInput}
                />
                <GlassInput
                  label="Concierge allowance"
                  value={conciergeFeePct}
                  onChangeText={setConciergeFeePct}
                  keyboardType="decimal-pad"
                  containerStyle={styles.halfInput}
                />
              </View>
              <Text style={styles.note}>
                GC management must be confirmed by the homeowner before active recommendations can be sent.
              </Text>
            </GlassCard>

            <GlassButton
              label="Create Draft for Homeowner"
              onPress={handleCreate}
              loading={loading || profileLoading}
              disabled={!profileReady}
              fullWidth
              size="lg"
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
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: Spacing.md },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  headerBody: { flex: 1 },
  title: { ...Typography.h2, marginBottom: 4 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 21 },
  card: { marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  inputSpacing: { marginBottom: Spacing.sm },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  segment: {
    minWidth: '30%',
    flexGrow: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    borderColor: 'rgba(255,107,0,0.65)',
    backgroundColor: 'rgba(255,107,0,0.14)',
  },
  segmentText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '800' },
  segmentTextActive: { color: Colors.text.primary },
  row: { flexDirection: 'row', gap: 8 },
  cityInput: { flex: 1 },
  provinceInput: { width: 88 },
  halfInput: { flex: 1 },
  note: { ...Typography.caption, color: Colors.text.secondary, lineHeight: 18, marginTop: 10 },
});
