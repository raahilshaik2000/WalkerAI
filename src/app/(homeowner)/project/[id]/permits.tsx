import { useEffect, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native'
import { useRoute } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { supabase } from '@/lib/supabase/client';
import { uploadFile } from '@/lib/supabase/storage';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
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
  const projectId = route.params?.id;
  const navigation = useNavigation<any>();
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermits = async () => {
      const { data } = await supabase
        .from('permits')
        .select('id, permit_type, status, document_url')
        .eq('project_id', projectId);
      setPermits(data ?? []);
      setLoading(false);
    };
    fetchPermits();
  }, [projectId]);

const handleUploadDoc = async (permit: Permit) => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      selectionLimit: 1,
    });
    if (result.didCancel || !result.assets || !result.assets[0]) return;

    try {
      const path = `${projectId}/${permit.id}-${Date.now()}.jpg`;
      const { publicUrl } = await uploadFile('permits', path, result.assets[0].uri ?? '', 'image/jpeg');

      await supabase
        .from('permits')
        .update({ document_url: publicUrl })
        .eq('id', permit.id);

      setPermits((prev) => prev.map((p) => p.id === permit.id ? { ...p, document_url: publicUrl } : p));
    } catch {
      Alert.alert('Upload failed', 'Please try again.');
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

          {permits.length === 0 && !loading && (
            <GlassCard>
              <Text style={styles.emptyText}>
                No permits required for this project. Your contractor will advise if any permits become necessary during construction.
              </Text>
            </GlassCard>
          )}

          {permits.map((permit) => {
            const stepIndex = PERMIT_STATUS_ORDER.indexOf(permit.status);
            const isPassed = permit.status === 'passed';

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
                {permit.document_url ? (
                  <Image source={{ uri: permit.document_url }} style={styles.docPreview} resizeMode="cover" />
                ) : (
                  <TouchableOpacity style={styles.uploadArea} onPress={() => handleUploadDoc(permit)} activeOpacity={0.8}>
                    <Text style={styles.uploadText}>📎 Upload permit document</Text>
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
