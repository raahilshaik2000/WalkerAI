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
import { getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
import { useAuthStore } from '@/stores/auth.store';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground } from '@/components/ui';

interface DocUploadState {
  uri: string | null;
  fileName?: string | null;
  type?: string | null;
  uploading: boolean;
  progress: number;
}

export default function InsuranceOnboardingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const [insurance, setInsurance] = useState<DocUploadState>({ uri: null, uploading: false, progress: 0 });
  const [wc, setWc] = useState<DocUploadState>({ uri: null, uploading: false, progress: 0 });
  const [submitting, setSubmitting] = useState(false);

  const pickDoc = async (setter: (s: DocUploadState) => void) => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
      assetRepresentationMode: 'compatible',
    });
    if (!result.didCancel && result.assets && result.assets[0]) {
      const asset = result.assets[0];
      setter({
        uri: asset.uri ?? null,
        fileName: asset.fileName ?? null,
        type: asset.type ?? null,
        uploading: false,
        progress: 0,
      });
    }
  };

  const uploadDoc = async (
    state: DocUploadState,
    prefix: string
  ): Promise<string | null> => {
    if (!state.uri) return null;
    if (!user?.id) throw new Error('Please sign in again before uploading documents.');
    const upload = getUploadMetadata(state);
    const path = `${user.id}/${prefix}-${Date.now()}.${upload.extension}`;
    const result = await uploadFile('company-docs', path, upload.uri, upload.contentType);
    return result.storagePath;
  };

  const handleSubmit = async () => {
    if (!insurance.uri) {
      Alert.alert('Required', 'Please upload your liability insurance certificate.');
      return;
    }

    setSubmitting(true);
    try {
      if (!user?.id) throw new Error('Please sign in again before submitting contractor verification.');

      const [insuranceUrl, wcUrl] = await Promise.all([
        uploadDoc(insurance, 'insurance'),
        uploadDoc(wc, 'wc'),
      ]);

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (companyError) throw companyError;
      if (!company) throw new Error('Company not found.');

      const { data: updated, error } = await supabase
        .from('companies')
        .update({
          insurance_doc_url: insuranceUrl,
          ...(wcUrl ? { wc_doc_url: wcUrl } : {}),
        })
        .eq('id', company.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!updated) throw new Error('Company insurance documents were not saved.');

      // Navigate to pending verification screen
      navigation.reset({ index: 0, routes: [{ name: 'PendingVerification' }] });
    } catch (err) {
      Alert.alert('Could not submit verification', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress */}
          <View style={styles.progressRow}>
            {[1, 2, 3].map((step) => (
              <View
                key={step}
                style={[styles.progressDot, styles.progressDotActive]}
              />
            ))}
          </View>

          <Text style={styles.stepLabel}>STEP 3 OF 3</Text>
          <Text style={styles.title}>Insurance & WCB</Text>
          <Text style={styles.subtitle}>
            Upload your certificates. Our team reviews them within 1–2 business days before you can receive jobs.
          </Text>

          <GlassCard style={styles.card}>
            <Text style={styles.sectionTitle}>Liability Insurance</Text>
            <Text style={styles.sectionSub}>
              Certificate of Insurance showing minimum $2M general liability coverage.
            </Text>
            <DocUploadBlock
              label="Upload Insurance Certificate"
              state={insurance}
              onPick={() => pickDoc(setInsurance)}
              onRemove={() => setInsurance({ uri: null, uploading: false, progress: 0 })}
            />
          </GlassCard>

          <GlassCard style={styles.card}>
            <Text style={styles.sectionTitle}>WCB / Workers' Compensation</Text>
            <Text style={styles.sectionSub}>
              Clearance letter from your provincial WCB (optional but recommended).
            </Text>
            <DocUploadBlock
              label="Upload WCB Certificate"
              state={wc}
              onPick={() => pickDoc(setWc)}
              onRemove={() => setWc({ uri: null, uploading: false, progress: 0 })}
            />
          </GlassCard>

          <GlassButton
            label="Submit for Verification"
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
            style={styles.cta}
          />

          <Text style={styles.disclaimer}>
            By submitting, you confirm all documents are current and authentic. False submissions will result in permanent account removal.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

function DocUploadBlock({
  label,
  state,
  onPick,
  onRemove,
}: {
  label: string;
  state: DocUploadState;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <View>
      <TouchableOpacity
        style={[styles.uploadArea, state.uri && styles.uploadAreaFilled]}
        onPress={onPick}
        activeOpacity={0.8}
      >
        {state.uri ? (
          <Image source={{ uri: state.uri }} style={styles.uploadPreview} />
        ) : (
          <View style={styles.uploadPlaceholder}>
            <Icon name="file-upload-outline" size={28} color={Colors.text.secondary} />
            <Text style={styles.uploadText}>{label}</Text>
            <Text style={styles.uploadSub}>JPG or PNG, max 10MB</Text>
          </View>
        )}
      </TouchableOpacity>
      {state.uri && (
        <TouchableOpacity onPress={onRemove} style={styles.removeButton}>
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
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
  sectionTitle: { ...Typography.h3, marginBottom: 6 },
  sectionSub: { ...Typography.caption, marginBottom: 14 },
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
  uploadIcon: { fontSize: 28 },
  uploadText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '500' },
  uploadSub: { color: Colors.text.tertiary, fontSize: 12 },
  removeButton: { alignSelf: 'center', marginTop: 8 },
  removeText: { color: Colors.error, fontSize: 13 },
  cta: { marginBottom: Spacing.md },
  disclaimer: {
    ...Typography.caption,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    lineHeight: 18,
  },
});
