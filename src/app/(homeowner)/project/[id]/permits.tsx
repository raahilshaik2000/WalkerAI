import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/lib/supabase/client';
import { documentKindFromPath } from '@/lib/document-preview';
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { pickPhotosWithSource } from '@/lib/media-picker';
import { getSignedUrl, getUploadMetadata, uploadPickerAsset } from '@/lib/supabase/storage';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';

interface Permit {
  id: string;
  permit_type: string;
  status: string;
  document_url: string | null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [newPermitType, setNewPermitType] = useState('');
  const [addingPermit, setAddingPermit] = useState(false);

  const fetchPermits = useCallback(async () => {
    if (!projectId) {
      setErrorMessage('Project is missing. Reopen permits from the project page.');
      setPermits([]);
      setPreviewUrls({});
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('permits')
        .select('id, permit_type, status, document_url')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });
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
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchPermits();
    }, [fetchPermits]),
  );

  const handleAddPermit = async () => {
    if (!projectId) {
      Alert.alert('Missing project', 'Please reopen permits from the project page.');
      return;
    }
    const label = newPermitType.trim();
    if (!label) {
      Alert.alert('Type required', 'Enter a permit or inspection label (e.g. Rough-in inspection).');
      return;
    }
    setAddingPermit(true);
    try {
      const { error } = await supabase.from('permits').insert({
        project_id: projectId,
        permit_type: label,
        status: 'not_applied',
      });
      if (error) throw error;
      setNewPermitType('');
      await fetchPermits();
    } catch (err) {
      Alert.alert('Could not add record', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setAddingPermit(false);
    }
  };

  const handleUploadDoc = async (permit: Permit) => {
    if (!projectId) {
      Alert.alert('Missing project', 'Please reopen permits from the project page.');
      return;
    }
    if (uploadingId) return;

    const assets = await pickPhotosWithSource({
      quality: 0.45,
      selectionLimit: 1,
      includeBase64: true,
      maxWidth: 1280,
      maxHeight: 1280,
    });
    if (!assets?.[0]) return;

    setUploadingId(permit.id);
    try {
      const upload = getUploadMetadata(assets[0]);
      // Prefer jpeg extension for smaller payload when picker still reports png/heic.
      const extension = upload.contentType === 'image/jpeg' ? 'jpg' : upload.extension;
      const path = `${projectId}/${permit.id}-${Date.now()}.${extension}`;
      const { storagePath } = await uploadPickerAsset('permits', path, assets[0], 'image/jpeg');

      const { error } = await supabase
        .from('permits')
        .update({ document_url: storagePath })
        .eq('id', permit.id)
        .eq('project_id', projectId);
      if (error) throw error;

      let signedUrl: string | null = null;
      try {
        signedUrl = await getSignedUrl('permits', storagePath, 3600);
      } catch {
        // Preview can fail while the file still saved — still mark document present.
      }

      setPermits((prev) => prev.map((p) => (p.id === permit.id ? { ...p, document_url: storagePath } : p)));
      if (signedUrl) {
        setPreviewUrls((prev) => ({ ...prev, [permit.id]: signedUrl }));
      }
      Alert.alert('Uploaded', 'Permit / inspection photo saved.');
    } catch (err) {
      Alert.alert('Upload failed', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setUploadingId(null);
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchPermits();
              }}
              tintColor={Colors.accent}
            />
          }
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Permits</Text>
            <View style={{ width: 48 }} />
          </View>

          <GlassCard style={styles.addCard}>
            <Text style={styles.addTitle}>Add permit / inspection</Text>
            <Text style={styles.addHint}>
              Create a record first, then upload the photo or document for that permit or inspection.
            </Text>
            <GlassInput
              label="Type"
              value={newPermitType}
              onChangeText={setNewPermitType}
              placeholder="e.g. Plumbing permit, Rough-in inspection"
              containerStyle={styles.addInput}
            />
            <GlassButton
              label="Add Record"
              onPress={handleAddPermit}
              loading={addingPermit}
              size="sm"
              fullWidth
            />
          </GlassCard>

          {errorMessage && !loading && (
            <GlassCard>
              <Text style={styles.emptyText}>{errorMessage}</Text>
              <GlassButton
                label="Try Again"
                onPress={() => {
                  setLoading(true);
                  fetchPermits();
                }}
                size="sm"
                fullWidth
                style={{ marginTop: 12 }}
              />
            </GlassCard>
          )}

          {!errorMessage && permits.length === 0 && !loading && (
            <GlassCard>
              <Text style={styles.emptyText}>
                No permit or inspection records yet. Add one above, or they appear after your project brief is generated.
              </Text>
            </GlassCard>
          )}

          {permits.map((permit) => {
            const stepIndex = PERMIT_STATUS_ORDER.indexOf(permit.status);
            const isPassed = permit.status === 'passed';
            const previewUrl = previewUrls[permit.id];
            const documentKind = documentKindFromPath(permit.document_url);
            const isUploading = uploadingId === permit.id;

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

                {previewUrl && documentKind === 'image' ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setSelectedPreviewImage(previewUrl)}
                  >
                    <Image source={{ uri: previewUrl }} style={styles.docPreview} resizeMode="cover" />
                  </TouchableOpacity>
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
                ) : permit.document_url ? (
                  <View style={styles.uploadArea}>
                    <Text style={styles.uploadText}>Document saved — preview unavailable</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.uploadBtn, isUploading && styles.uploadBtnDisabled]}
                  onPress={() => handleUploadDoc(permit)}
                  activeOpacity={0.85}
                  disabled={!!uploadingId}
                >
                  {isUploading ? (
                    <ActivityIndicator color={Colors.accentFg} />
                  ) : (
                    <Text style={styles.uploadBtnText}>
                      {permit.document_url ? 'Replace photo / document' : 'Upload permit / inspection photo'}
                    </Text>
                  )}
                </TouchableOpacity>
              </GlassCard>
            );
          })}
        </ScrollView>

        <Modal
          visible={!!selectedPreviewImage}
          transparent={false}
          animationType="fade"
          onRequestClose={() => setSelectedPreviewImage(null)}
        >
          <View style={styles.fullScreenContainer}>
            <SafeAreaView style={styles.fullScreenHeader}>
              <TouchableOpacity
                style={styles.fullScreenCloseBtn}
                onPress={() => setSelectedPreviewImage(null)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.fullScreenTitle}>Permit Document</Text>
              <View style={{ width: 40 }} />
            </SafeAreaView>
            {selectedPreviewImage ? (
              <View style={styles.fullScreenWrapper}>
                <Image source={{ uri: selectedPreviewImage }} style={styles.fullScreenImage} resizeMode="contain" />
              </View>
            ) : null}
          </View>
        </Modal>
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
  addCard: { marginBottom: Spacing.sm },
  addTitle: { ...Typography.h3, marginBottom: 4 },
  addHint: { ...Typography.caption, marginBottom: 10, lineHeight: 18 },
  addInput: { marginBottom: 10 },
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
    paddingVertical: 16,
    marginBottom: 12,
  },
  uploadText: { color: Colors.text.secondary, fontSize: 14, fontWeight: '500' },
  uploadBtn: {
    minHeight: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  uploadBtnDisabled: { opacity: 0.7 },
  uploadBtnText: { color: Colors.accentFg, fontSize: 14, fontWeight: '700' },
  emptyText: { ...Typography.bodySecondary, lineHeight: 22 },

  fullScreenContainer: { flex: 1, backgroundColor: '#000' },
  fullScreenHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 24 : 36,
  },
  fullScreenCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullScreenTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  fullScreenWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  fullScreenImage: { width: SCREEN_WIDTH, height: '100%' },
});
