import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import {
  isProjectVoiceAvailable,
  listenForProjectAnswer,
  requestProjectVoicePermissions,
  speakProjectPrompt,
  stopProjectVoice,
} from '@/lib/project-voice';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, AddressAutocomplete, WizardHeader } from '@/components/ui';
import type { AddressResult } from '@/components/ui';

export default function AddressStep() {
  const navigation = useNavigation<any>();
  const { projectId, setAddress } = useProjectWizardStore();
  const [addressResult, setAddressResult] = useState<AddressResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceQuery, setVoiceQuery] = useState('');
  const [voiceQueryKey, setVoiceQueryKey] = useState(0);
  const voiceAvailable = isProjectVoiceAvailable();

  const handleVoiceAddressSearch = async () => {
    if (voiceBusy) return;

    if (!voiceAvailable) {
      Alert.alert(
        'Voice address unavailable',
        'Voice address search is available on iPhone in this version. You can still type your address manually.'
      );
      return;
    }

    setVoiceBusy(true);
    setVoiceTranscript('');
    try {
      const permissions = await requestProjectVoicePermissions();
      if (!permissions.speech || !permissions.microphone) {
        Alert.alert('Permission needed', 'Enable microphone and speech recognition permissions to search by voice.');
        return;
      }

      await speakProjectPrompt('Say the full project address, including city and province.');
      const transcript = await listenForProjectAnswer(9);
      if (!transcript) {
        Alert.alert('No address heard', 'Please try again or type your address manually.');
        return;
      }

      setVoiceTranscript(transcript);
      setVoiceQuery(transcript);
      setVoiceQueryKey((current) => current + 1);
      setAddressResult(null);
    } catch (err) {
      Alert.alert('Voice address failed', err instanceof Error ? err.message : 'Please try again or type your address manually.');
    } finally {
      setVoiceBusy(false);
      await stopProjectVoice();
    }
  };

  const handleNext = async () => {
    if (!projectId) {
      Alert.alert('Project missing', 'Go back and complete the project brief before adding an address.');
      return;
    }

    if (!addressResult) {
      Alert.alert('Required', 'Please select your project address.');
      return;
    }

    const hasCoordinates = Number.isFinite(addressResult.lat) && Number.isFinite(addressResult.lng);
    if (!hasCoordinates) {
      Alert.alert('Address required', 'Please select a suggested address from the list so we can find nearby contractors.');
      return;
    }

    if (!addressResult.city || !addressResult.province) {
      Alert.alert('Address incomplete', 'Please select an address that includes a city and province.');
      return;
    }

    setLoading(true);
    try {
      // Update the existing draft project with address
      const { data: updatedProject, error } = await supabase
        .from('projects')
        .update({
          address: addressResult.fullAddress,
          city: addressResult.city,
          province: addressResult.province,
          postal_code: addressResult.postalCode || null,
          lat: addressResult.lat,
          lng: addressResult.lng,
        })
        .eq('id', projectId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!updatedProject) throw new Error('Project address could not be saved. Please restart project creation.');

      setAddress(
        addressResult.fullAddress,
        addressResult.lat != null && addressResult.lng != null
          ? { lat: addressResult.lat, lng: addressResult.lng }
          : undefined,
        addressResult.province,
      );
      useProjectWizardStore.getState().setStep(7);
      navigation.navigate('Brief');
    } catch (err: any) {
      const msg = err?.message || err?.details || err?.hint || 'Something went wrong. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.content}>
            <WizardHeader currentStep={6} />

            <Text style={styles.stepLabel}>STEP 6 OF 8</Text>
            <Text style={styles.title}>Where's the{'\n'}project?</Text>
            <Text style={styles.subtitle}>
              We use your address to find verified contractors near you.
            </Text>

            <TouchableOpacity
              style={[styles.voiceCard, voiceBusy && styles.voiceCardActive, !voiceAvailable && styles.voiceCardDisabled]}
              onPress={handleVoiceAddressSearch}
              activeOpacity={0.85}
              disabled={voiceBusy || loading || !voiceAvailable}
            >
              <View style={[styles.voiceIcon, voiceBusy && styles.voiceIconActive, !voiceAvailable && styles.voiceIconDisabled]}>
                <Ionicons
                  name={voiceBusy ? 'radio-outline' : 'mic-outline'}
                  size={18}
                  color={voiceBusy ? '#000' : voiceAvailable ? Colors.accent : Colors.text.tertiary}
                />
              </View>
              <View style={styles.voiceTextWrap}>
                <Text style={styles.voiceTitle}>
                  {voiceBusy ? 'Listening for your address…' : voiceAvailable ? 'Search address with voice' : 'Voice unavailable on this device'}
                </Text>
                <Text style={styles.voiceSub} numberOfLines={2}>
                  {voiceTranscript
                    ? `Heard: ${voiceTranscript}. Select the matching suggested address below.`
                    : voiceAvailable
                      ? 'Speak the full address, then choose the matching suggestion.'
                      : 'Type your address and select a suggested match.'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Address input */}
            <View style={styles.addressCard}>
              <AddressAutocomplete
                placeholder="Search your address..."
                voiceQuery={voiceQuery}
                voiceQueryKey={voiceQueryKey}
                onSelect={(result) => setAddressResult(result)}
                onClearSelection={() => setAddressResult(null)}
              />
              {addressResult && (
                <View style={styles.selectedAddress}>
                  <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                  <Text style={styles.selectedText}>{addressResult.fullAddress}</Text>
                </View>
              )}
            </View>

            {/* Spacer */}
            <View style={styles.spacer} />

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
  keyboard: { flex: 1 },
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
    marginBottom: Spacing.md,
  },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    backgroundColor: 'rgba(255, 107, 0, 0.07)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: Spacing.md,
  },
  voiceCardActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255, 107, 0, 0.14)',
  },
  voiceCardDisabled: {
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    opacity: 0.78,
  },
  voiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
  },
  voiceIconActive: {
    backgroundColor: Colors.accent,
  },
  voiceIconDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  voiceTextWrap: {
    flex: 1,
  },
  voiceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 3,
  },
  voiceSub: {
    ...Typography.caption,
    lineHeight: 17,
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
  spacer: { flex: 1 },
});
