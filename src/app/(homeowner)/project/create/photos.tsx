import { useState } from 'react';
import {
  Alert,
  FlatList,
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
import { uploadFile } from '@/lib/supabase/storage';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, Skeleton } from '@/components/ui';

const MIN_PHOTOS = 4;
const MAX_PHOTOS = 12;

export default function PhotosStep() {
  const navigation = useNavigation<any>();
  const { projectId, addPhoto, updatePhoto, removePhoto, photos } = useProjectWizardStore();
  const [analyzing, setAnalyzing] = useState(false);

  const pickPhotos = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.85,
    });

    if (!result.didCancel && result.assets) {
      // Add photos to store as 'uploading'
      for (const asset of result.assets) {
        const tempId = `temp_${Date.now()}_${Math.random()}`;
        addPhoto({ id: tempId, uri: asset.uri ?? '', status: 'uploading', progress: 0, url: '' });

        // Upload in background
        uploadFile(
          'project-photos',
          `${projectId}/${tempId}.jpg`,
          asset.uri ?? '',
          'image/jpeg',
          (progress) => updatePhoto(tempId, { progress })
        )
          .then(async ({ publicUrl }) => {
            updatePhoto(tempId, { status: 'done', url: publicUrl, progress: 100 });
            // Save to project_photos table
            await supabase.from('project_photos').insert({
              project_id: projectId,
              url: publicUrl,
              storage_path: `project-photos/${projectId}/${tempId}.jpg`,
            });
          })
          .catch(() => updatePhoto(tempId, { status: 'error' }));
      }
    }
  };

  const handleAnalyze = async () => {
    const uploadedPhotos = photos.filter((p) => p.status === 'done');
    if (uploadedPhotos.length < MIN_PHOTOS) {
      Alert.alert(
        'More photos needed',
        `Please add at least ${MIN_PHOTOS} photos so our AI can accurately analyze your space.`
      );
      return;
    }

    setAnalyzing(true);
    useProjectWizardStore.getState().setStep(3);
    navigation.navigate('Analyzing');
  };

  const uploadedCount = photos.filter((p) => p.status === 'done').length;
  const uploadingCount = photos.filter((p) => p.status === 'uploading').length;
  const canContinue = uploadedCount >= MIN_PHOTOS && uploadingCount === 0;

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress */}
          <View style={styles.progressRow}>
            {Array.from({ length: 7 }, (_, i) => (
              <View
                key={i}
                style={[styles.progressSeg, i <= 1 && styles.progressSegActive]}
              />
            ))}
          </View>

          <Text style={styles.stepLabel}>STEP 2 OF 7</Text>
          <Text style={styles.title}>Add photos</Text>
          <Text style={styles.subtitle}>
            The more photos, the better Claude can analyze your space.
            Include all angles, cabinets, floors, fixtures, and any problem areas.
          </Text>

          {/* Tips */}
          <View style={styles.tipsRow}>
            {['Good lighting', 'Multiple angles', 'Fixtures & cabinets', 'Problem areas'].map((tip) => (
              <View key={tip} style={styles.tipBadge}>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>

          {/* Photo grid */}
          {photos.length > 0 && (
            <View style={styles.grid}>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.photoCell}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImage} />
                  {photo.status === 'uploading' && (
                    <View style={styles.uploadOverlay}>
                      <Skeleton width={photo.progress} height={3} radius={2} style={styles.progressBar} />
                    </View>
                  )}
                  {photo.status === 'error' && (
                    <View style={[styles.uploadOverlay, styles.errorOverlay]}>
                      <Text style={styles.errorBadge}>Failed</Text>
                    </View>
                  )}
                  {photo.status === 'done' && (
                    <View style={styles.doneCheck}>
                      <Text style={styles.doneCheckText}>✓</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removePhoto(photo.id)}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add more cell */}
              {photos.length < MAX_PHOTOS && (
                <TouchableOpacity style={styles.addCell} onPress={pickPhotos} activeOpacity={0.7}>
                  <Text style={styles.addCellIcon}>+</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Upload CTA when empty */}
          {photos.length === 0 && (
            <TouchableOpacity style={styles.emptyArea} onPress={pickPhotos} activeOpacity={0.8}>
              <Text style={styles.emptyIcon}>📷</Text>
              <Text style={styles.emptyTitle}>Select {MIN_PHOTOS}+ photos</Text>
              <Text style={styles.emptySub}>From your camera roll</Text>
            </TouchableOpacity>
          )}

          {/* Status line */}
          <Text style={styles.statusLine}>
            {uploadedCount} of {photos.length} uploaded
            {uploadingCount > 0 ? ` · ${uploadingCount} uploading…` : ''}
            {uploadedCount < MIN_PHOTOS
              ? ` · Need ${MIN_PHOTOS - uploadedCount} more`
              : ' · Ready!'}
          </Text>

          <GlassButton
            label="Analyze with AI"
            onPress={handleAnalyze}
            disabled={!canContinue}
            loading={analyzing}
            fullWidth
            size="lg"
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const CELL_SIZE = 104;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  progressRow: { flexDirection: 'row', gap: 5, marginBottom: Spacing.lg },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.glass.surface,
  },
  progressSegActive: { backgroundColor: Colors.accent },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.sm, lineHeight: 22 },
  tipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  tipBadge: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tipText: { fontSize: 12, color: Colors.text.secondary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.sm,
  },
  photoCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: Radius.item,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    padding: 8,
  },
  progressBar: { backgroundColor: Colors.accent },
  errorOverlay: { justifyContent: 'center', alignItems: 'center' },
  errorBadge: {
    backgroundColor: Colors.error,
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  doneCheck: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneCheckText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: Radius.item,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.glass.surface,
  },
  addCellIcon: { fontSize: 28, color: Colors.text.tertiary },
  emptyArea: {
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginBottom: Spacing.sm,
    gap: 10,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { color: Colors.text.primary, fontSize: 16, fontWeight: '600' },
  emptySub: { color: Colors.text.tertiary, fontSize: 14 },
  statusLine: { ...Typography.caption, textAlign: 'center', marginBottom: Spacing.md },
  cta: {},
});
