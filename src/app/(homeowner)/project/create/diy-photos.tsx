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
import { useDIYWizardStore } from '@/stores/diy-wizard.store';
import { GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 8;

export default function DIYPhotosScreen() {
  const navigation = useNavigation<any>();
  const { photos, addPhoto, removePhoto } = useDIYWizardStore();
  const [submitting, setSubmitting] = useState(false);

  const pickPhotos = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 1,
      includeBase64: true,
    });
    if (!result.didCancel && result.assets) {
      for (const asset of result.assets) {
        const id = `diy_${Date.now()}_${Math.random()}`;
        addPhoto({ id, uri: asset.uri ?? '', status: 'done', progress: 100, url: '' }, asset.base64 ?? undefined);
      }
    }
  };

  const doneCount = photos.filter((p) => p.status === 'done').length;
  const canContinue = doneCount >= MIN_PHOTOS;

  const handleNext = () => {
    if (!canContinue) {
      Alert.alert('More photos needed', `Please add at least ${MIN_PHOTOS} photos so we can analyze your space.`);
      return;
    }
    setSubmitting(true);
    navigation.navigate('DIYDetails');
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.stepLabel}>STEP 2 OF 3</Text>
          <Text style={styles.title}>Add photos</Text>
          <Text style={styles.subtitle}>
            Show us the area you're working on. The more angles the better — our AI will use these to personalize your guide.
          </Text>

          <View style={styles.tipsRow}>
            {['Close-up of issue', 'Wide angle view', 'Existing materials', 'Problem area'].map((tip) => (
              <View key={tip} style={styles.tip}>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>

          {photos.length > 0 ? (
            <View style={styles.grid}>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.cell}>
                  <Image source={{ uri: photo.uri }} style={styles.cellImg} />
                  {photo.status === 'done' && (
                    <View style={styles.check}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(photo.id)}>
                    <Text style={styles.removeTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <TouchableOpacity style={styles.addCell} onPress={pickPhotos} activeOpacity={0.7}>
                  <Text style={styles.addIcon}>+</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.emptyArea} onPress={pickPhotos} activeOpacity={0.8}>
              <Ionicons name="camera-outline" size={48} color={Colors.text.tertiary} />
              <Text style={styles.emptyTitle}>Select {MIN_PHOTOS}+ photos</Text>
              <Text style={styles.emptySub}>From your camera roll</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.status}>
            {doneCount} photo{doneCount !== 1 ? 's' : ''} added
            {doneCount < MIN_PHOTOS ? ` · Need ${MIN_PHOTOS - doneCount} more` : ' · Ready!'}
          </Text>

          <GlassButton
            label="Next: Project Details"
            onPress={handleNext}
            disabled={!canContinue}
            loading={submitting}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const CELL = 104;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 100 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.md },
  backText: { color: '#fff', fontSize: 16 },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.sm, lineHeight: 22 },
  tipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.lg },
  tip: { backgroundColor: Colors.glass.surface, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.glass.border, paddingHorizontal: 12, paddingVertical: 5 },
  tipText: { fontSize: 12, color: Colors.text.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.sm },
  cell: { width: CELL, height: CELL, borderRadius: Radius.item, overflow: 'hidden', position: 'relative' },
  cellImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  check: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  removeBtn: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addCell: { width: CELL, height: CELL, borderRadius: Radius.item, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.glass.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.glass.surface },
  addIcon: { fontSize: 28, color: Colors.text.tertiary },
  emptyArea: { borderRadius: Radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.glass.border, backgroundColor: Colors.glass.surface, alignItems: 'center', justifyContent: 'center', padding: 40, marginBottom: Spacing.sm, gap: 10 },
  emptyTitle: { color: Colors.text.primary, fontSize: 16, fontWeight: '600' },
  emptySub: { color: Colors.text.tertiary, fontSize: 14 },
  status: { ...Typography.caption, textAlign: 'center', marginBottom: Spacing.md },
});
