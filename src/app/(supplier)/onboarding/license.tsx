import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { pickPhotosWithSource } from '@/lib/media-picker';
import { supabase } from '@/lib/supabase/client';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getUploadMetadata, uploadBase64, uploadFile } from '@/lib/supabase/storage';
import { useAuthStore } from '@/stores/auth.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground } from '@/components/ui';
import { buildSupplierLicenseUpdatePayload } from '@/lib/supplier-onboarding';

function isMissingColumnError(error: { message?: string } | null | undefined) {
  return !!error?.message && /column .* does not exist/i.test(error.message);
}

export default function SupplierLicenseOnboarding() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [licenseNumber, setLicenseNumber] = useState('');
  const [docUri, setDocUri] = useState<string | null>(null);
  const [docBase64, setDocBase64] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [docType, setDocType] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pickDoc = async () => {
    const assets = await pickPhotosWithSource({
      selectionLimit: 1,
      quality: 0.8,
      maxWidth: 1600,
      maxHeight: 1600,
      includeBase64: true,
    });
    if (!assets?.[0]) return;
    setDocUri(assets[0].uri ?? null);
    setDocBase64(assets[0].base64 ?? null);
    setDocName(assets[0].fileName ?? 'license.jpg');
    setDocType(assets[0].type ?? null);
  };

  const handleNext = async () => {
    if (!licenseNumber.trim()) {
      Alert.alert('Required', 'Please enter your business license number.');
      return;
    }
    setLoading(true);
    try {
      if (!user?.id) throw new Error('Please sign in again before continuing supplier onboarding.');

      let docPath: string | null = null;
      if (docUri) {
        const upload = getUploadMetadata({ uri: docUri, fileName: docName, type: docType });
        const path = `supplier-licenses/${user.id}/license.${upload.extension}`;
        const { storagePath } = docBase64
          ? await uploadBase64('company-docs', path, docBase64, upload.contentType)
          : await uploadFile('company-docs', path, upload.uri, upload.contentType);
        docPath = storagePath;
      }

      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (supplierError) throw supplierError;
      if (!supplier) throw new Error('Supplier profile not found. Complete business details first.');

      let updateResult = await supabase
        .from('suppliers')
        .update(buildSupplierLicenseUpdatePayload(licenseNumber, docPath))
        .eq('id', supplier.id)
        .select('id')
        .maybeSingle();

      if (isMissingColumnError(updateResult.error) && docPath) {
        console.warn('suppliers.license_doc_url missing; saving license number without document path.');
        updateResult = await supabase
          .from('suppliers')
          .update(buildSupplierLicenseUpdatePayload(licenseNumber, null))
          .eq('id', supplier.id)
          .select('id')
          .maybeSingle();
      }

      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) throw new Error('Supplier license was not saved.');
      navigation.navigate('SupplierCategoriesOnboarding');
    } catch (err) {
      Alert.alert('Could not save license', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
          </TouchableOpacity>

          <View style={styles.stepRow}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={[styles.stepDot, s <= 2 && styles.stepDotActive]} />
            ))}
          </View>

          <Text style={styles.title}>Business License</Text>
          <Text style={styles.subtitle}>Required to verify your supply business</Text>

          <GlassCard style={styles.card} padding={Spacing.md}>
            <GlassInput
              label="License Number"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              autoCapitalize="characters"
              containerStyle={{ marginBottom: Spacing.md }}
            />

            <Text style={styles.docLabel}>License Document (optional)</Text>
            <TouchableOpacity style={styles.uploadBox} onPress={pickDoc} activeOpacity={0.7}>
              <Ionicons name={docUri ? 'checkmark-circle' : 'cloud-upload-outline'} size={32} color={docUri ? '#34D399' : Colors.text.secondary} />
              <Text style={[styles.uploadText, docUri && { color: '#34D399' }]}>
                {docUri ? docName : 'Tap to upload photo of license'}
              </Text>
            </TouchableOpacity>
          </GlassCard>

          <GlassButton label="Next — Categories" onPress={handleNext} loading={loading} fullWidth size="lg" />
        </ScrollView>
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
  docLabel: { fontSize: 13, color: Colors.text.secondary, marginBottom: 10 },
  uploadBox: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    borderRadius: Radius.item,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  uploadText: { fontSize: 14, color: Colors.text.secondary, textAlign: 'center' },
});
