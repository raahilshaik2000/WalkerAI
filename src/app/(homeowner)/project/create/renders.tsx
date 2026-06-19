import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
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
import { formatAppSafeErrorMessage } from '@/lib/supabase/functions';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import {
  shouldGenerateImagePreview,
  shouldLoadExistingImagePreviews,
  visualPreviewUnavailableMessage,
} from '@/lib/visual-preview';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { USDZViewer } from '@/components/room-scan';
import { RoomMaterialCustomizer } from '@/components/project/RoomMaterialCustomizer';
import { RoomCustomizer3D } from '@/components/project/RoomCustomizer3D';
import { GlassButton, GlassCard, GradientBackground, WizardHeader } from '@/components/ui';

interface Render {
  id: string;
  url: string;
  style_params: Record<string, string>;
  selected?: boolean | null;
}

export default function RendersStep() {
  const navigation = useNavigation<any>();
  const {
    projectId,
    answers,
    roomType,
    roomScanData,
    surfaceSelections,
    setSelectedRender,
    setSurfaceSelection,
  } = useProjectWizardStore();

  const [renders, setRenders] = useState<Render[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSelection, setSavingSelection] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const hasRoomModel = !!roomScanData;
  const subtitle = hasRoomModel
    ? 'Use your measured room model as the visual reference, then choose finishes for the contractor brief.'
    : renders.length > 0
    ? 'Select a style reference, then choose finishes for the contractor brief.'
    : 'Choose finishes here so your project brief captures material preferences. Generated image previews are optional and not required.';
  const primaryLabel = renders.length > 0 && !hasRoomModel
    ? 'Save Preview & Build Brief'
    : 'Continue to Project Brief';

  useEffect(() => {
    const generate = async () => {
      if (!shouldLoadExistingImagePreviews(projectId, roomScanData)) {
        setRenders([]);
        setSelectedId(null);
        setRenderError(projectId ? null : 'Project is missing. Continue to the brief or restart project creation.');
        setLoading(false);
        return;
      }

      if (!projectId) {
        setRenderError('Project is missing. Continue to the brief or restart project creation.');
        setLoading(false);
        return;
      }
      try {
        setRenderError(null);
        const { data: existingRenders, error: existingError } = await supabase
          .from('renders')
          .select('id, url, style_params, selected')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });
        if (existingError) throw existingError;

        if (Array.isArray(existingRenders) && existingRenders.length > 0) {
          const typedRenders = existingRenders as Render[];
          setRenders(typedRenders);
          setSelectedId(typedRenders.find((render) => render.selected)?.id ?? typedRenders[0]?.id ?? null);
          return;
        }

        if (!shouldGenerateImagePreview(projectId, roomScanData)) {
          setRenderError(null);
        }
      } catch (err) {
        setRenderError(visualPreviewUnavailableMessage(formatAppSafeErrorMessage(err, 'Render generation failed.')));
      } finally {
        setLoading(false);
      }
    };
    generate();
  }, [projectId, roomScanData]);

  const handleSelect = (renderId: string) => {
    ReactNativeHapticFeedback.trigger('impactLight');
    setSelectedId(renderId);
  };

  const handleNext = async () => {
    if (savingSelection) return;

    if (!projectId) {
      setSelectedRender(null);
      useProjectWizardStore.getState().setStep(6);
      navigation.navigate('Address');
      return;
    }

    if (!roomScanData && !selectedId && renders.length > 0) return;

    setSavingSelection(true);
    try {
      if (!roomScanData && selectedId) {
        const { error: clearError } = await supabase
          .from('renders')
          .update({ selected: false })
          .eq('project_id', projectId);
        if (clearError) {
          setRenderError(formatAppSafeErrorMessage(clearError, 'Could not update render selection.'));
          return;
        }

        const { data: selectedRender, error: selectError } = await supabase
          .from('renders')
          .update({ selected: true })
          .eq('id', selectedId)
          .eq('project_id', projectId)
          .select('id')
          .maybeSingle();
        if (selectError) {
          setRenderError(formatAppSafeErrorMessage(selectError, 'Could not save selected render.'));
          return;
        }
        if (!selectedRender) {
          setRenderError('Selected render could not be found for this project.');
          return;
        }

        const { error: projectUpdateError } = await supabase
          .from('projects')
          .update({ selected_render_id: selectedId })
          .eq('id', projectId);
        if (projectUpdateError) {
          setRenderError(formatAppSafeErrorMessage(projectUpdateError, 'Could not save project render selection.'));
          return;
        }
      }

      setRenderError(null);
      setSelectedRender(roomScanData ? null : selectedId);
      useProjectWizardStore.getState().setStep(6);
      navigation.navigate('Address');
    } catch (err) {
      setRenderError(formatAppSafeErrorMessage(err, 'Could not save render selection.'));
    } finally {
      setSavingSelection(false);
    }
  };

  if (loading) {
    return (
      <GradientBackground glow="center">
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Checking visual previews…</Text>
            <Text style={styles.loadingSubtext}>Your finish selections and brief can continue without generated images</Text>
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
          <Text style={styles.title}>Optional Visual Preview</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* When the 3D customizer is shown (iOS + scan data) it already
             includes a rotatable 3D scene, so the read-only scan reference
             would be redundant. Only show the standalone scan reference on
             Android or when no customizer is available. */}
          {roomScanData && Platform.OS !== 'ios' ? (
            <GlassCard style={styles.modelCard}>
              <View style={styles.modelHeader}>
                <View>
                  <Text style={styles.modelTitle}>Measured Room Model</Text>
                  <Text style={styles.modelSubtitle}>Scan reference</Text>
                </View>
                <View style={styles.modelBadge}>
                  <Ionicons name="cube-outline" size={14} color={Colors.accent} />
                  <Text style={styles.modelBadgeText}>Measured</Text>
                </View>
              </View>
              <View style={styles.modelViewer}>
                <USDZViewer
                  filePath={typeof roomScanData.usdzFilePath === 'string' ? roomScanData.usdzFilePath : null}
                  scanData={roomScanData}
                  style={styles.modelViewerInner}
                />
              </View>
            </GlassCard>
          ) : !roomScanData && renders.length > 0 ? (
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
          ) : (
            <GlassCard style={styles.emptyCard}>
              <Ionicons name="color-palette-outline" size={40} color={Colors.text.tertiary} style={{ alignSelf: 'center', marginBottom: 10 }} />
              <Text style={styles.emptyTitle}>Finish preview ready</Text>
              <Text style={styles.emptyNote}>
                {renderError
                  ? `${renderError}. The project brief can still continue from photos, measurements, and material preferences.`
                  : 'Cabinet, countertop, tile, fixture, and color preferences will be included in your project brief.'}
              </Text>
            </GlassCard>
          )}

          {Platform.OS === 'ios' && roomScanData ? (
            <RoomCustomizer3D
              roomType={roomType}
              scanData={roomScanData}
              selections={surfaceSelections}
              answers={answers}
              onSelect={setSurfaceSelection}
            />
          ) : (
            <RoomMaterialCustomizer
              roomType={roomType}
              selections={surfaceSelections}
              answers={answers}
              onSelect={setSurfaceSelection}
            />
          )}

          <GlassButton
            label={primaryLabel}
            onPress={handleNext}
            disabled={renders.length > 0 && !hasRoomModel && !selectedId}
            loading={savingSelection}
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
  emptyCard: { marginBottom: Spacing.lg, alignItems: 'center', paddingVertical: Spacing.lg },
  emptyTitle: { ...Typography.h3, marginBottom: 8, textAlign: 'center' },
  emptyNote: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 20 },
  modelCard: { marginBottom: Spacing.lg, padding: 14 },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  modelTitle: { ...Typography.h3 },
  modelSubtitle: { ...Typography.caption, marginTop: 2 },
  modelBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    paddingHorizontal: 10,
  },
  modelBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  modelViewer: {
    height: 260,
    borderRadius: Radius.item,
    overflow: 'hidden',
    backgroundColor: Colors.bg.primary,
  },
  modelViewerInner: { borderRadius: Radius.item },
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
