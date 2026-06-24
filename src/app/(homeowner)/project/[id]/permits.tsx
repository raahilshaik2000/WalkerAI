import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '@/lib/supabase/client';
import { documentKindFromPath } from '@/lib/document-preview';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { getSignedUrl, getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassCard, GradientBackground, StatusBadge } from '@/components/ui';

interface Permit {
  id: string;
  permit_type: string;
  status: string;
  document_url: string | null;
}

const PERMIT_STATUS_ORDER = ['not_applied', 'applied', 'approved', 'inspection_scheduled', 'passed'];

const STATUS_VARIANT: Record<string, any> = {
  not_applied: 'neutral',
  applied: 'pending',
  approved: 'info',
  inspection_scheduled: 'warning',
  passed: 'completed',
};

export default function PermitsScreen() {
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const navigation = useNavigation<any>();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchPermits = async () => {
      if (!projectId) {
        setErrorMessage('Project is missing. Reopen permits from the project page.');
        setPermits([]);
        setPreviewUrls({});
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('permits')
          .select('id, permit_type, status, document_url')
          .eq('project_id', projectId);
        if (error) {
          setErrorMessage(formatAppSafeErrorMessage(error, 'Could not load permits.'));
          setPermits([]);
          setPreviewUrls({});
          return;
        }

        const rows = (data ?? []) as Permit[];
        setPermits(rows);
        setErrorMessage(null);

        const previews: Record<string, string> = {};
        await Promise.all(rows.map(async (permit) => {
          if (!permit.document_url) return;
          if (/^https?:\/\//i.test(permit.document_url)) {
            previews[permit.id] = permit.document_url;
            return;
          }
          try {
            previews[permit.id] = await getSignedUrl('permits', permit.document_url, 3600);
          } catch {
            // Keep the permit visible even if the private preview URL cannot be minted.
          }
        }));
        setPreviewUrls(previews);
      } catch (err) {
        setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load permits.'));
        setPermits([]);
        setPreviewUrls({});
      } finally {
        setLoading(false);
      }
    };
    fetchPermits();
  }, [projectId]);

  const handleUploadDoc = async (permit: Permit) => {
    if (!projectId) {
      Alert.alert('Missing project', 'Please reopen permits from the project page.');
      return;
    }
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
      assetRepresentationMode: 'compatible',
    });
    if (result.didCancel || !result.assets || !result.assets[0]) return;

    try {
      const upload = getUploadMetadata(result.assets[0]);
      const path = `${projectId}/${permit.id}-${Date.now()}.${upload.extension}`;
      const { storagePath } = await uploadFile('permits', path, upload.uri, upload.contentType);

      const { error } = await supabase
        .from('permits')
        .update({ document_url: storagePath })
        .eq('id', permit.id)
        .eq('project_id', projectId);
      if (error) throw error;

      const signedUrl = await getSignedUrl('permits', storagePath, 3600);
      setPermits((prev) => prev.map((p) => p.id === permit.id ? { ...p, document_url: storagePath } : p));
      setPreviewUrls((prev) => ({ ...prev, [permit.id]: signedUrl }));
    } catch (err) {
      Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Please try again.'));
    }
  };

  const handleOpenDocument = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open document', 'Please try again in a moment.');
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Permits</Text>
            <View style={{ width: 48 }} />
          </View>

          {errorMessage && !loading && (
            <GlassCard>
              <Text style={styles.emptyText}>{errorMessage}</Text>
            </GlassCard>
          )}

          {!errorMessage && permits.length === 0 && !loading && (
            <GlassCard>
              <Text style={styles.emptyText}>
                No permits required for this project. Your contractor will advise if any permits become necessary during construction.
              </Text>
            </GlassCard>
          )}

          {permits.map((permit) => {
            const stepIndex = PERMIT_STATUS_ORDER.indexOf(permit.status);
            const isPassed = permit.status === 'passed';
            const previewUrl = previewUrls[permit.id];
            const documentKind = documentKindFromPath(permit.document_url);

            return (
              <GlassCard key={permit.id} style={styles.permitCard}>
                <View style={styles.permitHeader}>
                  <Text style={styles.permitType}>{permit.permit_type}</Text>
                  <StatusBadge
                    label={permit.status.replace('_', ' ')}
                    variant={STATUS_VARIANT[permit.status]}
                    dot={!isPassed}
                  />
                </View>

                {/* Progress bar */}
                <View style={styles.progressRow}>
                  {PERMIT_STATUS_ORDER.map((step, i) => (
                    <View
                      key={step}
                      style={[
                        styles.progressStep,
                        i <= stepIndex && styles.progressStepActive,
                      ]}
                    />
                  ))}
                </View>
                <View style={styles.progressLabels}>
                  {['Not applied', 'Applied', 'Approved', 'Inspection', 'Passed'].map((l, i) => (
                    <Text key={i} style={[styles.progressLabel, i <= stepIndex && styles.progressLabelActive]}>
                      {l}
                    </Text>
                  ))}
                </View>

                {/* Document */}
                {previewUrl && documentKind === 'image' ? (
                  <Image source={{ uri: previewUrl }} style={styles.docPreview} resizeMode="cover" />
                ) : previewUrl ? (
                  <TouchableOpacity
                    style={styles.documentRow}
                    onPress={() => handleOpenDocument(previewUrl)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.documentIcon}>
                      <Text style={styles.documentIconText}>{documentKind === 'pdf' ? 'PDF' : 'DOC'}</Text>
                    </View>
                    <View style={styles.documentTextWrap}>
                      <Text style={styles.documentTitle}>
                        {documentKind === 'pdf' ? 'Open permit PDF' : 'Open permit document'}
                      </Text>
                      <Text style={styles.documentSubtitle}>Stored securely in project permits</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.uploadArea} onPress={() => handleUploadDoc(permit)} activeOpacity={0.8}>
                    <Text style={styles.uploadText}>
                      {permit.document_url ? 'Preview unavailable - upload replacement' : 'Upload permit photo'}
                    </Text>
                  </TouchableOpacity>
                )}

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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  backText: { color: Colors.text.secondary, fontSize: 15 },
  title: { ...Typography.h2 },
  permitCard: { marginBottom: Spacing.sm },
  permitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  permitType: { ...Typography.h3, flex: 1, marginRight: 8 },
  progressRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  progressStep: {
    flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.glass.surface,
  },
  progressStepActive: { backgroundColor: Colors.accent },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  progressLabel: { fontSize: 9, color: Colors.text.tertiary, textAlign: 'center', flex: 1 },
  progressLabelActive: { color: Colors.accent },
  docPreview: { width: '100%', height: 160, borderRadius: Radius.item, marginBottom: 12 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    padding: 12,
    marginBottom: 12,
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
  documentIconText: { color: Colors.accent, fontSize: 11, fontWeight: '800' },
  documentTextWrap: { flex: 1 },
  documentTitle: { color: Colors.text.primary, fontSize: 14, fontWeight: '700' },
  documentSubtitle: { ...Typography.caption, marginTop: 2 },
  uploadArea: {
    borderRadius: Radius.item,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginBottom: 12,
  },
  uploadText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '500' },
  advanceBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  advanceBtnText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  emptyText: { ...Typography.bodySecondary, lineHeight: 22 },
});
