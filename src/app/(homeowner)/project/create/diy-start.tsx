import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useDIYWizardStore, type DIYCategory } from '@/stores/diy-wizard.store';
import { GlassButton, GradientBackground } from '@/components/ui';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

const CATEGORIES: { id: DIYCategory; label: string; icon: string; color: string }[] = [
  { id: 'plumbing',    label: 'Plumbing',    icon: 'water-outline',         color: '#60A5FA' },
  { id: 'electrical',  label: 'Electrical',  icon: 'flash-outline',         color: '#F59E0B' },
  { id: 'carpentry',   label: 'Carpentry',   icon: 'hammer-outline',        color: '#A78BFA' },
  { id: 'painting',    label: 'Painting',    icon: 'color-palette-outline', color: '#34D399' },
  { id: 'flooring',    label: 'Flooring',    icon: 'grid-outline',          color: '#FB7185' },
  { id: 'hvac',        label: 'HVAC',        icon: 'thermometer-outline',   color: '#38BDF8' },
  { id: 'landscaping', label: 'Landscaping', icon: 'leaf-outline',          color: '#4ADE80' },
  { id: 'general',     label: 'General',     icon: 'construct-outline',     color: '#FF6B00' },
];

export default function DIYStartScreen() {
  const navigation = useNavigation<any>();
  const { description, category, setDescription, setCategory } = useDIYWizardStore();
  const [localDesc, setLocalDesc] = useState(description);

  const canContinue = localDesc.trim().length >= 10 && category !== null;

  const handleNext = () => {
    setDescription(localDesc.trim());
    navigation.navigate('DIYPhotos');
  };

  return (
    <GradientBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <Text style={styles.stepLabel}>STEP 1 OF 3</Text>
          <Text style={styles.title}>What are you{'\n'}working on?</Text>
          <Text style={styles.subtitle}>
            Describe your project and we'll generate a step-by-step guide tailored to your space.
          </Text>

          {/* Description */}
          <Text style={styles.fieldLabel}>Describe your task</Text>
          <TextInput
            style={styles.textArea}
            placeholder="e.g. I have a leaking pipe under my kitchen sink, it's been dripping for 2 days..."
            placeholderTextColor={Colors.text.tertiary}
            multiline
            numberOfLines={4}
            value={localDesc}
            onChangeText={setLocalDesc}
            maxLength={500}
          />
          <Text style={styles.charCount}>{localDesc.length}/500</Text>

          {/* Category */}
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const selected = category === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catItem, selected && { borderColor: cat.color, backgroundColor: cat.color + '18' }]}
                  onPress={() => setCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.catIcon, { backgroundColor: cat.color + '20' }]}>
                    <Ionicons name={cat.icon as any} size={20} color={selected ? cat.color : Colors.text.secondary} />
                  </View>
                  <Text style={[styles.catLabel, selected && { color: cat.color }]}>{cat.label}</Text>
                  {selected && (
                    <View style={[styles.catCheck, { backgroundColor: cat.color }]}>
                      <Ionicons name="checkmark" size={10} color="#000" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <GlassButton
            label="Next: Add Photos"
            onPress={handleNext}
            disabled={!canContinue}
            fullWidth
            size="lg"
            style={styles.cta}
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 100 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.md },
  backText: { color: '#fff', fontSize: 16 },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg, lineHeight: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  textArea: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    color: '#fff',
    fontSize: 15,
    padding: 14,
    minHeight: 110,
    textAlignVertical: 'top',
    marginBottom: 4,
  },
  charCount: { fontSize: 11, color: Colors.text.tertiary, textAlign: 'right', marginBottom: Spacing.lg },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.xl },
  catItem: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 12,
    position: 'relative',
  },
  catIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontSize: 13, fontWeight: '600', color: Colors.text.secondary, flex: 1 },
  catCheck: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cta: { marginTop: 8 },
});
