import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GlassCard, GradientBackground, WizardHeader } from '@/components/ui';

interface Render {
  id: string;
  url: string;
  style_params: Record<string, string>;
}

export default function RendersStep() {
  const navigation = useNavigation<any>();
  const { projectId, analysisResult, answers, setSelectedRender } = useProjectWizardStore();

  const [renders, setRenders] = useState<Render[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Render generation requires REimagineHome integration (coming soon).
    // Skip the API call and go straight to the brief-ready state.
    setLoading(false);
  }, []);

  const handleSelect = (renderId: string) => {
    ReactNativeHapticFeedback.trigger('impactLight');
    setSelectedId(renderId);
  };

  const handleNext = async () => {
    if (!selectedId && renders.length > 0) return;

    // Update DB with selected render
    if (selectedId) {
      await supabase
        .from('renders')
        .update({ selected: true })
        .eq('id', selectedId);

      await supabase
        .from('projects')
        .update({ selected_render_id: selectedId })
        .eq('id', projectId);
    }

    setSelectedRender(selectedId);
    useProjectWizardStore.getState().setStep(6);
    navigation.navigate('Brief');
  };

  if (loading) {
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Generating AI renders…</Text>
            <Text style={styles.loadingSubtext}>This usually takes 15–30 seconds</Text>
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <WizardHeader currentStep={5} />

          <Text style={styles.stepLabel}>STEP 5 OF 8</Text>
          <Text style={styles.title}>Your renovation renders</Text>
          <Text style={styles.subtitle}>
            AI-generated renders are coming soon. Proceed to generate your detailed project brief.
          </Text>

          <GlassCard style={styles.comingSoonCard}>
            <Ionicons name="color-palette-outline" size={48} color={Colors.accent} style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.comingSoonTitle}>Renders coming soon</Text>
            <Text style={styles.comingSoonNote}>
              We're integrating AI render generation. Your contractor will visualize the renovation based on your brief and questionnaire answers.
            </Text>
          </GlassCard>

          {!error && renders.length > 0 && (
            <View style={styles.rendersGrid}>
              {renders.map((render) => {
                const isSelected = selectedId === render.id;
                return (
                  <TouchableOpacity
                    key={render.id}
                    onPress={() => handleSelect(render.id)}
                    activeOpacity={0.9}
                    style={[styles.renderCard, isSelected && styles.renderCardSelected]}
                  >
                    <Image
                      source={{ uri: render.url }}
                      style={styles.renderImage}
                      resizeMode="cover"
                    />
                    <View style={styles.renderOverlay}>
                      {render.style_params?.design_style && (
                        <View style={styles.styleBadge}>
                          <Text style={styles.styleBadgeText}>
                            {render.style_params.design_style}
                          </Text>
                        </View>
                      )}
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>Selected ✓</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <GlassButton
            label="Generate Project Brief"
            onPress={handleNext}
            disabled={renders.length > 0 && !selectedId && !error}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </SafeAreaView>
    </GradientBackground>
  );
}

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
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg, lineHeight: 22 },
  comingSoonCard: { marginBottom: Spacing.lg, alignItems: 'center', paddingVertical: Spacing.lg },
  comingSoonIcon: { fontSize: 40, marginBottom: 12 },
  comingSoonTitle: { ...Typography.h3, marginBottom: 8, textAlign: 'center' },
  comingSoonNote: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 20 },
  rendersGrid: { gap: 16, marginBottom: Spacing.lg },
  renderCard: {
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.glass.border,
  },
  renderCardSelected: {
    borderColor: Colors.accent,
  },
  renderImage: {
    width: '100%',
    height: 220,
  },
  renderOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  styleBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  styleBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  selectedBadge: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  selectedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: { ...Typography.h3 },
  loadingSubtext: { ...Typography.bodySecondary },
});
