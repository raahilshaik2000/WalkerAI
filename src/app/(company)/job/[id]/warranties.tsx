import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { documentKindFromPath } from '@/lib/document-preview';
import { normalizeOptionalIsoDate } from '@/lib/dates';
import { getSignedUrl, getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GradientBackground, ListItemSkeleton } from '@/components/ui';

interface Warranty {
  id: string;
  document_url: string;
  expiry_date: string | null;
  created_at: string;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function CompanyWarrantiesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');

  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchWarranties = useCallback(async () => {
    if (!projectId) {
      setErrorMessage('Project is missing. Reopen warranties from the job page.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from('warranties')
      .select('id, document_url, expiry_date, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      setWarranties([]);
      setPreviewUrls({});
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Warranty[];
    const previews: Record<string, string> = {};
    await Promise.all(rows.map(async (warranty) => {
      try {
        previews[warranty.id] = /^https?:\/\//i.test(warranty.document_url)
          ? warranty.document_url
          : await getSignedUrl('warranties', warranty.document_url, 3600);
      } catch {
        // Keep the warranty visible even if private preview signing fails.
      }
    }));

    setWarranties(rows);
    setPreviewUrls(previews);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchWarranties();
    if (!projectId) return;
    const channel = supabase
      .channel(`company-warranties:${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warranties', filter: `project_id=eq.${projectId}` }, fetchWarranties)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchWarranties, projectId]);

  const pickWarrantyDoc = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
      assetRepresentationMode: 'compatible',
    });

    if (result.didCancel || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setSelectedUri(asset.uri ?? null);
    setSelectedName(asset.fileName ?? 'warranty.jpg');
    setSelectedType(asset.type ?? null);
  };

  const handleUpload = async () => {
    if (!projectId) {
      Alert.alert('Missing project', 'Reopen this job and try again.');
      return;
    }
    if (!selectedUri) {
      Alert.alert('Warranty photo required', 'Upload a warranty card or product coverage photo first.');
      return;
    }

    setUploading(true);
    try {
      const expiry = normalizeOptionalIsoDate(expiryDate, 'warranty expiry');
      const upload = getUploadMetadata({ uri: selectedUri, fileName: selectedName, type: selectedType });
      const path = `${projectId}/warranty-${Date.now()}.${upload.extension}`;
      const { storagePath } = await uploadFile('warranties', path, upload.uri, upload.contentType);
      const { data, error } = await supabase
        .from('warranties')
        .insert({
          project_id: projectId,
          document_url: storagePath,
          expiry_date: expiry,
        })
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Warranty document was not saved.');

      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setSelectedUri(null);
      setSelectedName(null);
      setSelectedType(null);
      setExpiryDate('');
      await fetchWarranties();
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <Text style={styles.title}>Warranties</Text>
            <View style={styles.headerSpacer} />
          </View>

          <Text style={styles.subtitle}>
            Upload closeout warranty cards, appliance labels, and product coverage photos for the homeowner.
          </Text>

          <GlassCard style={styles.uploadCard}>
            <Text style={styles.sectionTitle}>Add warranty photo</Text>
            <TouchableOpacity
              style={[styles.uploadArea, selectedUri && styles.uploadAreaFilled]}
              onPress={pickWarrantyDoc}
              activeOpacity={0.85}
            >
              {selectedUri ? (
                <Image source={{ uri: selectedUri }} style={styles.selectedPreview} resizeMode="cover" />
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <Icon name="file-upload-outline" size={30} color={Colors.text.secondary} />
                  <Text style={styles.uploadText}>Upload warranty photo</Text>
                  <Text style={styles.uploadSub}>JPG or PNG, max 10MB</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Expiry date (optional)</Text>
            <TextInput
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.text.tertiary}
              keyboardType="numbers-and-punctuation"
              style={styles.input}
            />

            <GlassButton
              label="Save Warranty"
              onPress={handleUpload}
              loading={uploading}
              fullWidth
              size="md"
              style={styles.saveButton}
            />
          </GlassCard>

          <Text style={styles.listTitle}>Uploaded Warranties</Text>

          {loading ? (
            Array.from({ length: 2 }).map((_, index) => (
              <ListItemSkeleton key={index} style={styles.skeleton} />
            ))
          ) : errorMessage ? (
            <GlassCard style={styles.emptyCard}>
              <Icon name="alert-circle-outline" size={42} color={Colors.error} />
              <Text style={styles.emptyTitle}>Could not load warranties</Text>
              <Text style={styles.emptyBody}>{errorMessage}</Text>
              <GlassButton label="Try Again" onPress={fetchWarranties} size="sm" style={styles.retryButton} />
            </GlassCard>
          ) : warranties.length === 0 ? (
            <GlassCard style={styles.emptyCard}>
              <Icon name="shield-check-outline" size={42} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>No warranties uploaded</Text>
              <Text style={styles.emptyBody}>Add warranty cards, labels, or product coverage photos before or after final closeout.</Text>
            </GlassCard>
          ) : warranties.map((warranty) => {
            const previewUrl = previewUrls[warranty.id];
            const documentKind = documentKindFromPath(warranty.document_url);

            return (
              <GlassCard key={warranty.id} style={styles.warrantyCard}>
                <View style={styles.cardHeader}>
                  <Icon name="shield-check-outline" size={20} color={Colors.success} />
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>Warranty document</Text>
                    <Text style={styles.cardMeta}>Uploaded {formatDate(warranty.created_at)}</Text>
                  </View>
                </View>

                {previewUrl && documentKind === 'image' ? (
                  <Image source={{ uri: previewUrl }} style={styles.preview} resizeMode="cover" />
                ) : previewUrl ? (
                  <TouchableOpacity
                    style={styles.documentRow}
                    onPress={() => { void Linking.openURL(previewUrl); }}
                    activeOpacity={0.82}
                  >
                    <View style={styles.documentIcon}>
                      <Icon
                        name={documentKind === 'pdf' ? 'file-pdf-box' : 'file-document-outline'}
                        size={26}
                        color={Colors.accent}
                      />
                    </View>
                    <View style={styles.documentTextWrap}>
                      <Text style={styles.documentTitle}>
                        {documentKind === 'pdf' ? 'Open warranty PDF' : 'Open warranty document'}
                      </Text>
                      <Text style={styles.documentSubtitle}>Secure closeout document</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.previewUnavailable}>Private preview unavailable</Text>
                )}

                <Text style={styles.expiryText}>
                  {warranty.expiry_date
                    ? `Coverage expiry: ${formatDate(warranty.expiry_date)}`
                    : 'No expiry date provided'}
                </Text>
              </GlassCard>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  headerSpacer: { width: 22 },
  title: { ...Typography.h2 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 22, marginBottom: Spacing.md },
  uploadCard: { marginBottom: Spacing.md },
  sectionTitle: { ...Typography.h3, marginBottom: 12 },
  uploadArea: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderStyle: 'dashed',
    backgroundColor: Colors.glass.surface,
    minHeight: 140,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  uploadAreaFilled: { borderStyle: 'solid' },
  selectedPreview: { width: '100%', height: 180 },
  uploadPlaceholder: { alignItems: 'center', gap: 8, padding: 20 },
  uploadText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '600' },
  uploadSub: { ...Typography.caption },
  inputLabel: { ...Typography.label, marginBottom: 8 },
  input: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    color: Colors.text.primary,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  saveButton: { marginTop: 12 },
  listTitle: { ...Typography.label, marginBottom: 10 },
  skeleton: { marginBottom: 10 },
  emptyCard: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 10 },
  emptyTitle: { ...Typography.h3, textAlign: 'center' },
  emptyBody: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 22 },
  retryButton: { marginTop: 8 },
  warrantyCard: { marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardTitleWrap: { flex: 1 },
  cardTitle: { ...Typography.h3 },
  cardMeta: { ...Typography.caption, marginTop: 2 },
  preview: { width: '100%', height: 170, borderRadius: Radius.item, marginBottom: 10 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    padding: 12,
    marginBottom: 10,
  },
  documentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentTextWrap: { flex: 1 },
  documentTitle: { color: Colors.text.primary, fontSize: 14, fontWeight: '700' },
  documentSubtitle: { ...Typography.caption, marginTop: 2 },
  previewUnavailable: { ...Typography.caption, marginBottom: 10 },
  expiryText: { ...Typography.bodySecondary },
});
