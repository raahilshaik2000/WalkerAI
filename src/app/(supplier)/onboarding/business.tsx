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
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';

export default function SupplierBusinessOnboarding() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [serviceRadius, setServiceRadius] = useState('100');
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!businessName.trim() || !city.trim() || !province.trim()) {
      Alert.alert('Required', 'Please fill in business name, city, and province.');
      return;
    }
    const radius = parseInt(serviceRadius, 10);
    if (isNaN(radius) || radius < 10 || radius > 1000) {
      Alert.alert('Invalid radius', 'Service radius must be between 10 and 1000 km.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('suppliers').upsert({
        user_id: user!.id,
        business_name: businessName.trim(),
        address: address.trim() || null,
        city: city.trim(),
        province: province.trim().toUpperCase().slice(0, 2),
        postal_code: postalCode.trim() || null,
        service_radius_km: radius,
        verified: false,
      });
      if (error) throw error;
      navigation.navigate('SupplierLicenseOnboarding');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save. Try again.');
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

            <GlassCard style={styles.card}>
              <GlassInput label="Business Name" value={businessName} onChangeText={setBusinessName} autoCapitalize="words" containerStyle={styles.input} />
              <GlassInput label="Street Address (optional)" value={address} onChangeText={setAddress} containerStyle={styles.input} />
              <View style={styles.row}>
                <GlassInput label="City" value={city} onChangeText={setCity} autoCapitalize="words" containerStyle={[styles.input, { flex: 1 }]} />
                <GlassInput label="Province" value={province} onChangeText={setProvince} autoCapitalize="characters" maxLength={2} containerStyle={[styles.input, { width: 80 }]} />
              </View>
              <GlassInput label="Postal Code (optional)" value={postalCode} onChangeText={setPostalCode} autoCapitalize="characters" containerStyle={styles.input} />
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
  card: { padding: Spacing.md, marginBottom: Spacing.lg },
  input: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', gap: 10 },
  hint: { fontSize: 12, color: Colors.text.tertiary, marginTop: 4 },
  btn: { marginTop: 4 },
});
