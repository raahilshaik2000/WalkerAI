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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, Skeleton, WizardHeader } from '@/components/ui';

const MIN_PHOTOS = 4;
const MAX_PHOTOS = 12;

export default function PhotosStep() {
  const navigation = useNavigation<any>();
  const { addPhoto, removePhoto, photos } = useProjectWizardStore();
  const [analyzing, setAnalyzing] = useState(false);

  const pickPhotos = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.3,       // Low quality keeps base64 small enough to send to Anthropic
      maxWidth: 1024,
      maxHeight: 1024,
      includeBase64: true,
    });

    if (!result.didCancel && result.assets) {
      for (const asset of result.assets) {
        const tempId = `temp_${Date.now()}_${Math.random()}`;
        addPhoto({
          id: tempId,
          uri: asset.uri ?? '',
          base64: asset.base64 ?? undefined,
          status: 'done',
          progress: 100,
          url: '',
        });
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
    navigation.navigate('Measurements');
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
          <WizardHeader currentStep={2} />

          <Text style={styles.stepLabel}>STEP 2 OF 8</Text>
          <Text style={styles.title}>Add photos</Text>
          <Text style={styles.subtitle}>
            The more photos, the better WalkerAI can analyze your space.
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
              <Ionicons name="camera-outline" size={48} color={Colors.text.tertiary} />
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
  emptyTitle: { color: Colors.text.primary, fontSize: 16, fontWeight: '600' },
  emptySub: { color: Colors.text.tertiary, fontSize: 14 },
  statusLine: { ...Typography.caption, textAlign: 'center', marginBottom: Spacing.md },
});
