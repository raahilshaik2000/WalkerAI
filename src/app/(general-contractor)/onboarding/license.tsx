import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
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
import { launchImageLibrary } from 'react-native-image-picker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getUploadMetadata, uploadFile, type StorageUploadAsset } from '@/lib/supabase/storage';
import { isValidGeneralContractorDocumentReference } from '@/lib/general-contractor';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';

export default function GeneralContractorLicenseOnboarding() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [licenseNumber, setLicenseNumber] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<StorageUploadAsset | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    const loadExistingLicense = async () => {
      const { data, error } = await supabase
        .from('general_contractors')
        .select('license_number, license_doc_url')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (cancelled || !data) return;
      setLicenseNumber(data.license_number ?? '');
      setDocumentUrl(data.license_doc_url ?? '');
    };

    loadExistingLicense().catch((err) => {
      if (!cancelled) {
        Alert.alert('Could not load license details', formatAppSafeErrorMessage(err, 'Please try again.'));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pickDocument = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
        assetRepresentationMode: 'compatible',
      });
      if (!result.didCancel && result.assets?.[0]) {
        setSelectedDocument(result.assets[0]);
      }
    } catch (err) {
      Alert.alert('Could not select document', formatAppSafeErrorMessage(err, 'Please try again.'));
    }
  };

  const uploadSelectedDocument = async (): Promise<string | null> => {
    if (!selectedDocument) return documentUrl.trim() || null;
    if (!user?.id) throw new Error('Please sign in again before uploading GC documents.');

    const upload = getUploadMetadata(selectedDocument);
    const path = `general-contractors/${user.id}/license-${Date.now()}.${upload.extension}`;
    const { storagePath } = await uploadFile('company-docs', path, upload.uri, upload.contentType);
    return storagePath;
  };

  const handleNext = async () => {
    if (!licenseNumber.trim()) {
      Alert.alert('License required', 'Enter the GC license or registration number.');
      return;
    }
    if (!documentUrl.trim() && !selectedDocument) {
      Alert.alert('License document required', 'Upload the license document or provide an existing secure document link.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again before continuing.');
      return;
    }
    if (!selectedDocument && !isValidGeneralContractorDocumentReference(documentUrl, user.id, 'license')) {
      Alert.alert('Invalid license document', 'Upload the license document or provide an HTTPS secure document link.');
      return;
    }

    setLoading(true);
    try {
      const { data: gc, error: profileError } = await supabase
        .from('general_contractors')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!gc?.id) {
        navigation.navigate('GeneralContractorBusinessOnboarding');
        return;
      }

      const uploadedDocumentPath = await uploadSelectedDocument();
      const { error } = await supabase
        .from('general_contractors')
        .update({
          license_number: licenseNumber.trim(),
          license_doc_url: uploadedDocumentPath,
        })
        .eq('id', gc.id);
      if (error) throw error;
      navigation.navigate('GeneralContractorInsuranceOnboarding');
    } catch (err) {
      Alert.alert('Error', formatAppSafeErrorMessage(err, 'Could not save license details.'));
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
                <View key={step} style={[styles.progressDot, step <= 2 && styles.progressDotActive]} />
              ))}
            </View>

            <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
            <Text style={styles.title}>License</Text>
            <Text style={styles.subtitle}>
              Add the license information homeowners and support will review before concierge work goes live.
            </Text>

            <GlassCard style={styles.card}>
              <GlassInput
                label="License / Registration Number"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
                autoCorrect={false}
                autoCapitalize="characters"
                containerStyle={styles.inputSpacing}
              />
              <GlassInput
                label="License Document URL"
                value={documentUrl}
                onChangeText={setDocumentUrl}
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType="url"
                hint="Existing saved document path or secure document link."
              />

              <Text style={styles.uploadLabel}>License Document</Text>
              <TouchableOpacity
                style={[styles.uploadArea, selectedDocument && styles.uploadAreaFilled]}
                onPress={pickDocument}
                activeOpacity={0.8}
              >
                {selectedDocument?.uri ? (
                  <Image source={{ uri: selectedDocument.uri }} style={styles.uploadPreview} />
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Ionicons name="cloud-upload-outline" size={30} color={Colors.text.secondary} />
                    <Text style={styles.uploadText}>
                      {documentUrl ? 'Replace uploaded license document' : 'Tap to upload license document'}
                    </Text>
                    <Text style={styles.uploadSub}>JPG or PNG, max 10MB</Text>
                  </View>
                )}
              </TouchableOpacity>
              {selectedDocument ? (
                <TouchableOpacity onPress={() => setSelectedDocument(null)} style={styles.removeButton}>
                  <Text style={styles.removeText}>Remove selected document</Text>
                </TouchableOpacity>
              ) : null}
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
  inputSpacing: { marginBottom: Spacing.sm },
  uploadLabel: { ...Typography.label, marginTop: Spacing.sm, marginBottom: 10 },
  uploadArea: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.glass.surface,
  },
  uploadAreaFilled: { borderStyle: 'solid' },
  uploadPreview: { width: '100%', height: 180, resizeMode: 'cover' },
  uploadPlaceholder: { alignItems: 'center', gap: 8, padding: 20 },
  uploadText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  uploadSub: { color: Colors.text.tertiary, fontSize: 12 },
  removeButton: { alignSelf: 'center', marginTop: 8 },
  removeText: { color: Colors.error, fontSize: 13, fontWeight: '700' },
});
