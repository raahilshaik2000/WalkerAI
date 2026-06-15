import { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { supabase } from '@/lib/supabase/client';
import { documentKindFromPath } from '@/lib/document-preview';
import { getSignedUrl, getUploadMetadata, uploadFile } from '@/lib/supabase/storage';
import { getRequiredStringParam } from '@/lib/navigation-params';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GlassInput, GradientBackground, StatusBadge } from '@/components/ui';

interface Permit {
  id: string;
  permit_type: string;
  status: string;
  document_url: string | null;
}

const PERMIT_STATUS_OPTIONS = [
  'not_applied',
  'applied',
  'approved',
  'inspection_scheduled',
  'passed',
] as const;

const STATUS_VARIANT: Record<string, 'neutral' | 'pending' | 'info' | 'warning' | 'completed'> = {
  not_applied: 'neutral',
  applied: 'pending',
  approved: 'info',
  inspection_scheduled: 'warning',
  passed: 'completed',
};

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

export default function GeneralContractorPermitsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const projectId = getRequiredStringParam(route.params, 'id');
  const [permits, setPermits] = useState<Permit[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [permitType, setPermitType] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchPermits = useCallback(async () => {
    try {
      setErrorMessage(null);
      const { data, error } = await supabase
        .from('permits')
        .select('id, permit_type, status, document_url')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Permit[];
      setPermits(rows);
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
          // Keep the row visible without preview.
        }
      }));
      setPreviewUrls(previews);
    } catch (err) {
      setPermits([]);
      setPreviewUrls({});
      setErrorMessage(err instanceof Error ? err.message : 'Could not load permits.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      fetchPermits();
    }, [fetchPermits]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPermits();
  };

  const handleAddPermit = async () => {
    if (!permitType.trim()) {
      Alert.alert('Permit type required', 'Enter the permit, inspection, or document type.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('permits').insert({
        project_id: projectId,
        permit_type: permitType.trim(),
        status: 'not_applied',
      });
      if (error) throw error;
      setPermitType('');
      await fetchPermits();
    } catch (err) {
      Alert.alert('Could not add permit', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (permit: Permit, status: string) => {
    const { error } = await supabase
      .from('permits')
      .update({ status })
      .eq('id', permit.id)
      .eq('project_id', projectId);
    if (error) {
      Alert.alert('Could not update status', error.message);
      return;
    }
    await fetchPermits();
  };

  const handleUpload = async (permit: Permit) => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
      assetRepresentationMode: 'compatible',
    });
    if (result.didCancel || !result.assets?.[0]) return;

    setUploadingId(permit.id);
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

      await fetchPermits();
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Icon name="arrow-left" size={22} color={Colors.text.secondary} />
            </TouchableOpacity>
            <View style={styles.headerBody}>
              <Text style={styles.title}>Permits & inspections</Text>
              <Text style={styles.subtitle}>Track project documents for homeowner visibility.</Text>
            </View>
          </View>

          <GlassCard style={styles.card}>
            <Text style={styles.sectionTitle}>Add record</Text>
            <GlassInput
              label="Permit / inspection type"
              value={permitType}
              onChangeText={setPermitType}
              containerStyle={styles.inputSpacing}
            />
            <GlassButton
              label="Add Record"
              onPress={handleAddPermit}
              loading={saving}
              size="sm"
              fullWidth
            />
          </GlassCard>

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading permits...</Text>
            </GlassCard>
          ) : permits.length === 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>No permit or inspection records yet.</Text>
            </GlassCard>
          ) : permits.map((permit) => {
            const previewUrl = previewUrls[permit.id];
            const documentKind = documentKindFromPath(permit.document_url);
            return (
              <GlassCard key={permit.id} style={styles.card}>
                <View style={styles.permitHeader}>
                  <View style={styles.permitBody}>
                    <Text style={styles.permitTitle}>{permit.permit_type}</Text>
                    <Text style={styles.permitSub}>Visible to homeowner</Text>
                  </View>
                  <StatusBadge label={statusLabel(permit.status)} variant={STATUS_VARIANT[permit.status] ?? 'neutral'} dot />
                </View>

                <View style={styles.statusGrid}>
                  {PERMIT_STATUS_OPTIONS.map((status) => {
                    const selected = permit.status === status;
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[styles.statusChip, selected && styles.statusChipActive]}
                        onPress={() => handleStatusChange(permit, status)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.statusChipText, selected && styles.statusChipTextActive]}>
                          {statusLabel(status)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {previewUrl && documentKind === 'image' ? (
                  <Image source={{ uri: previewUrl }} style={styles.docPreview} resizeMode="cover" />
                ) : previewUrl ? (
                  <TouchableOpacity style={styles.documentRow} onPress={() => { void Linking.openURL(previewUrl); }} activeOpacity={0.85}>
                    <Icon name={documentKind === 'pdf' ? 'file-pdf-box' : 'file-document-outline'} size={26} color={Colors.accent} />
                    <View style={styles.documentText}>
                      <Text style={styles.documentTitle}>Open document</Text>
                      <Text style={styles.documentSub}>Stored in project permits</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                <GlassButton
                  label={uploadingId === permit.id ? 'Uploading...' : permit.document_url ? 'Replace Document' : 'Upload Document'}
                  onPress={() => handleUpload(permit)}
                  loading={uploadingId === permit.id}
                  variant="secondary"
                  size="sm"
                  fullWidth
                />
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
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.sm, paddingTop: Spacing.sm, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: Spacing.md },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  headerBody: { flex: 1 },
  title: { ...Typography.h2, marginBottom: 3 },
  subtitle: { ...Typography.bodySecondary, lineHeight: 21 },
  card: { marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.label, marginBottom: 10 },
  inputSpacing: { marginBottom: Spacing.sm },
  bodyText: { ...Typography.bodySecondary, lineHeight: 22 },
  permitHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  permitBody: { flex: 1 },
  permitTitle: { ...Typography.h3 },
  permitSub: { ...Typography.caption, marginTop: 3 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statusChip: {
    borderWidth: 1,
    borderColor: Colors.surface.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Colors.surface.default,
  },
  statusChipActive: {
    borderColor: 'rgba(255,107,0,0.65)',
    backgroundColor: 'rgba(255,107,0,0.14)',
  },
  statusChipText: { color: Colors.text.secondary, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  statusChipTextActive: { color: Colors.text.primary },
  docPreview: { width: '100%', height: 150, borderRadius: Radius.item, marginBottom: 12 },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.default,
    padding: 12,
    marginBottom: 12,
  },
  documentText: { flex: 1 },
  documentTitle: { ...Typography.body, fontWeight: '800' },
  documentSub: { ...Typography.caption, marginTop: 2 },
});
