import { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getUploadMetadata, uploadFile, type StorageUploadAsset } from '@/lib/supabase/storage';
import { useAuthStore } from '@/stores/auth.store';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = error?.message;
  if (!message) return false;
  return /column .* does not exist/i.test(message)
    || /could not find the .* column of/i.test(message);
}

export default function LicenseOnboardingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [licenseNumber, setLicenseNumber] = useState('');
  const [licensePhoto, setLicensePhoto] = useState<StorageUploadAsset | null>(null);
  const [loading, setLoading] = useState(false);

  const pickLicensePhoto = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
      assetRepresentationMode: 'compatible',
    });
    if (!result.didCancel && result.assets && result.assets[0]) {
      setLicensePhoto(result.assets[0]);
    }
  };

  const handleNext = async () => {
    if (!licenseNumber.trim()) {
      Alert.alert('Required', 'Please enter your contractor license number.');
      return;
    }

    setLoading(true);
    try {
      if (!user?.id) throw new Error('Please sign in again before continuing contractor onboarding.');

      let licenseDocPath: string | null = null;

      // Upload license photo if provided
      if (licensePhoto) {
        const upload = getUploadMetadata(licensePhoto);
        const path = `${user.id}/license-${Date.now()}.${upload.extension}`;
        const result = await uploadFile(
          'company-docs',
          path,
          upload.uri,
          upload.contentType
        );
        licenseDocPath = result.storagePath;
      }

      // Look up company for this user
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (companyError) throw companyError;
      if (!company) throw new Error('Company not found. Please complete Step 1 first.');

      let updateResult = await supabase
        .from('companies')
        .update({
          license_number: licenseNumber.trim(),
          ...(licenseDocPath ? { license_doc_url: licenseDocPath } : {}),
        })
        .eq('id', company.id)
        .select('id')
        .maybeSingle();

      if (isMissingColumnError(updateResult.error) && licenseDocPath) {
        console.warn('companies.license_doc_url missing; saving license number without document path.');
        updateResult = await supabase
          .from('companies')
          .update({ license_number: licenseNumber.trim() })
          .eq('id', company.id)
          .select('id')
          .maybeSingle();
      }

      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) throw new Error('Company license was not saved.');
      navigation.navigate('InsuranceOnboarding');
    } catch (err) {
      Alert.alert('Could not save license', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Progress */}
          <View style={styles.progressRow}>
            {[1, 2, 3].map((step) => (
              <View
                key={step}
                style={[
                  styles.progressDot,
                  step <= 2 && styles.progressDotActive,
                ]}
              />
            ))}
          </View>

          <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
          <Text style={styles.title}>Contractor license</Text>
          <Text style={styles.subtitle}>
            Your license helps homeowners trust you. We verify all contractors before they receive jobs.
          </Text>

          <GlassCard style={styles.card}>
            <GlassInput
              label="License Number"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              autoCapitalize="characters"
              autoCorrect={false}
              containerStyle={styles.inputSpacing}
              hint="Your provincial contractor license number."
            />

            {/* License photo upload */}
            <Text style={styles.uploadLabel}>License Photo (optional)</Text>
            <TouchableOpacity
              style={[styles.uploadArea, licensePhoto && styles.uploadAreaFilled]}
              onPress={pickLicensePhoto}
              activeOpacity={0.8}
            >
              {licensePhoto ? (
                <Image source={{ uri: licensePhoto.uri ?? '' }} style={styles.uploadPreview} />
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <Icon name="file-document-outline" size={32} color={Colors.text.secondary} />
                  <Text style={styles.uploadText}>Tap to upload license photo</Text>
                  <Text style={styles.uploadSub}>JPG or PNG, max 10MB</Text>
                </View>
              )}
            </TouchableOpacity>
            {licensePhoto && (
              <TouchableOpacity
                onPress={() => setLicensePhoto(null)}
                style={styles.removePhoto}
              >
                <Text style={styles.removeText}>Remove photo</Text>
              </TouchableOpacity>
            )}
          </GlassCard>

          <GlassButton
            label="Continue"
            onPress={handleNext}
            loading={loading}
            fullWidth
            size="lg"
            style={styles.cta}
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('InsuranceOnboarding')}
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
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
  inputSpacing: { marginBottom: Spacing.sm },
  uploadLabel: { ...Typography.label, marginBottom: 10 },
  uploadArea: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.glass.surface,
  },
  uploadAreaFilled: {
    borderStyle: 'solid',
    borderColor: Colors.glass.border,
  },
  uploadPreview: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  uploadPlaceholder: { alignItems: 'center', gap: 8, padding: 24 },
  uploadIcon: { fontSize: 32 },
  uploadText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '500' },
  uploadSub: { color: Colors.text.tertiary, fontSize: 12 },
  removePhoto: { alignSelf: 'center', marginTop: 10 },
  removeText: { color: Colors.error, fontSize: 13 },
  cta: { marginTop: Spacing.xs },
  skipButton: { alignSelf: 'center', marginTop: Spacing.sm },
  skipText: { color: Colors.text.tertiary, fontSize: 14 },
});
