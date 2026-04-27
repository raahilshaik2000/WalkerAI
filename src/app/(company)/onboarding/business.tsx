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

export default function BusinessOnboardingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [serviceRadius, setServiceRadius] = useState('50');
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!companyName.trim() || !city.trim() || !province.trim()) {
      Alert.alert('Required fields', 'Please fill in your company name, city, and province.');
      return;
    }
    const radiusKm = parseInt(serviceRadius, 10);
    if (isNaN(radiusKm) || radiusKm < 10 || radiusKm > 500) {
      Alert.alert('Invalid radius', 'Service radius must be between 10 and 500 km.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('companies').upsert({
        user_id: user!.id,
        name: companyName.trim(),
        address: address.trim() || null,
        city: city.trim(),
        province: province.trim().toUpperCase(),
        postal_code: postalCode.trim() || null,
        service_radius_km: radiusKm,
      }, { onConflict: 'user_id', ignoreDuplicates: false });

      if (error) throw error;
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
          style={{ flex: 1 }}
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

              <GlassInput
                label="Street Address (optional)"
                value={address}
                onChangeText={setAddress}
                autoCorrect={false}
                containerStyle={styles.inputSpacing}
              />

              <View style={styles.row}>
                <GlassInput
                  label="City"
                  value={city}
                  onChangeText={setCity}
                  autoCorrect={false}
                  containerStyle={[styles.inputSpacing, { flex: 1, marginRight: 8 }]}
                />
                <GlassInput
                  label="Province"
                  value={province}
                  onChangeText={setProvince}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  maxLength={2}
                  containerStyle={[styles.inputSpacing, { width: 80 }]}
                />
              </View>

              <GlassInput
                label="Postal Code (optional)"
                value={postalCode}
                onChangeText={setPostalCode}
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
  cta: { marginTop: Spacing.xs },
});
