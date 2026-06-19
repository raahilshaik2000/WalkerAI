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
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { documentKindFromPath } from '@/lib/document-preview';
import { GENERAL_CONTRACTOR_READINESS_SELECT, isGeneralContractorReadyForProjectControls } from '@/lib/general-contractor';
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

interface Assignment {
  id: string;
  status: string;
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
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [permitType, setPermitType] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gcReady, setGcReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchPermits = useCallback(async () => {
    try {
      setErrorMessage(null);
      const currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser?.id) {
        setAssignment(null);
        setPermits([]);
        setPreviewUrls({});
        setGcReady(false);
        setErrorMessage('You need to be signed in to manage permits.');
        return;
      }

      const { data: gc, error: gcError } = await supabase
        .from('general_contractors')
        .select(GENERAL_CONTRACTOR_READINESS_SELECT)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (gcError) throw gcError;
      if (!gc?.id) throw new Error('GC profile not found.');
      setGcReady(isGeneralContractorReadyForProjectControls(gc));

      const { data: assignmentRow, error: assignmentError } = await supabase
        .from('general_contractor_projects')
        .select('id, status')
        .eq('project_id', projectId)
        .eq('general_contractor_id', gc.id)
        .maybeSingle();
      if (assignmentError) throw assignmentError;

      setAssignment(assignmentRow as Assignment | null);
      if (!['active', 'completed'].includes(assignmentRow?.status ?? '')) {
        setPermits([]);
        setPreviewUrls({});
        return;
      }

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
      setAssignment(null);
      setPermits([]);
      setPreviewUrls({});
      setGcReady(false);
      setErrorMessage(formatAppSafeErrorMessage(err, 'Could not load permits.'));
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
    if (assignment?.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before permits can be managed.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before permits can be managed.');
      return;
    }
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
      Alert.alert('Could not add permit', formatAppSafeErrorMessage(err, 'Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (permit: Permit, status: string) => {
    if (assignment?.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before permit statuses can be updated.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before permit statuses can be updated.');
      return;
    }
    try {
      const { error } = await supabase
        .from('permits')
        .update({ status })
        .eq('id', permit.id)
        .eq('project_id', projectId);
      if (error) throw error;
      await fetchPermits();
    } catch (err) {
      Alert.alert('Could not update status', formatAppSafeErrorMessage(err, 'Please try again.'));
    }
  };

  const handleUpload = async (permit: Permit) => {
    if (assignment?.status !== 'active') {
      Alert.alert('Active GC management required', 'The homeowner must confirm GC management before permit documents can be uploaded.');
      return;
    }
    if (!gcReady) {
      Alert.alert('Complete setup required', 'Complete verified GC setup is required before permit documents can be uploaded.');
      return;
    }
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

  const canViewPermits = assignment?.status === 'active' || assignment?.status === 'completed';
  const canManagePermits = assignment?.status === 'active' && gcReady;

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

          {canManagePermits ? (
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
          ) : !loading && !errorMessage && assignment?.status === 'completed' ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Project completed</Text>
              <Text style={styles.bodyText}>Project completed. Permit and inspection records are available read-only.</Text>
            </GlassCard>
          ) : !loading && !errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>{assignment?.status === 'active' ? 'Complete setup required' : 'Permits locked'}</Text>
              <Text style={styles.bodyText}>
                {assignment?.status === 'active'
                  ? 'Complete verified GC setup is required before permits, inspections, or uploaded documents can be managed.'
                  : 'The homeowner must confirm active GC management before permits, inspections, or uploaded documents can be managed.'}
              </Text>
            </GlassCard>
          ) : null}

          {errorMessage ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>{errorMessage}</Text>
            </GlassCard>
          ) : loading ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Loading permits...</Text>
            </GlassCard>
          ) : permits.length === 0 && canViewPermits ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>No permit or inspection records yet.</Text>
            </GlassCard>
          ) : permits.length === 0 ? (
            <GlassCard style={styles.card}>
              <Text style={styles.bodyText}>Permit records are available after homeowner-confirmed GC management starts.</Text>
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
                        style={[styles.statusChip, selected && styles.statusChipActive, !canManagePermits && styles.statusChipDisabled]}
                        onPress={() => handleStatusChange(permit, status)}
                        disabled={!canManagePermits}
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
                  <TouchableOpacity style={styles.documentRow} onPress={() => handleOpenDocument(previewUrl)} activeOpacity={0.85}>
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
                  disabled={!canManagePermits}
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
  statusChipDisabled: { opacity: 0.5 },
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
