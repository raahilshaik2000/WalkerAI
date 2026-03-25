import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, AddressAutocomplete, WizardHeader } from '@/components/ui';
import type { AddressResult } from '@/components/ui';

export default function AddressStep() {
  const navigation = useNavigation<any>();
  const { projectId, setAddress } = useProjectWizardStore();
  const [addressResult, setAddressResult] = useState<AddressResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNext = async () => {
    if (!addressResult) {
      Alert.alert('Required', 'Please select your project address.');
      return;
    }

    setLoading(true);
    try {
      // Update the existing draft project with address
      const { error } = await supabase
        .from('projects')
        .update({
          address: addressResult.fullAddress,
          city: addressResult.city,
          province: addressResult.province,
          postal_code: addressResult.postalCode || null,
        })
        .eq('id', projectId);

      if (error) throw error;

      setAddress(
        addressResult.fullAddress,
        addressResult.lat && addressResult.lng
          ? { lat: addressResult.lat, lng: addressResult.lng }
          : undefined,
        addressResult.province,
      );
      useProjectWizardStore.getState().setStep(8);
      navigation.navigate('Confirm');
    } catch (err: any) {
      const msg = err?.message || err?.details || JSON.stringify(err);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.content}>
            <WizardHeader currentStep={7} />

            <Text style={styles.stepLabel}>STEP 7 OF 8</Text>
            <Text style={styles.title}>Where's the{'\n'}project?</Text>
            <Text style={styles.subtitle}>
              We use your address to find verified contractors near you.
            </Text>

            {/* Address input */}
            <View style={styles.addressCard}>
              <AddressAutocomplete
                placeholder="Search your address..."
                onSelect={(result) => setAddressResult(result)}
              />
              {addressResult && (
                <View style={styles.selectedAddress}>
                  <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                  <Text style={styles.selectedText}>{addressResult.fullAddress}</Text>
                </View>
              )}
            </View>

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* CTA */}
            <GlassButton
              label="Continue"
              onPress={handleNext}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  stepLabel: {
    ...Typography.label,
    color: '#FF6B00',
    marginBottom: 8,
  },
  title: {
    ...Typography.h1,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.bodySecondary,
    marginBottom: Spacing.lg,
  },
  addressCard: {
    zIndex: 10,
  },
  selectedAddress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  selectedText: {
    fontSize: 13,
    color: Colors.text.secondary,
    flex: 1,
  },
});
