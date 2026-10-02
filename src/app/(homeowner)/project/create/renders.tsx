import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
import { useNavigation } from '@react-navigation/native';
import { formatAppSafeErrorMessage, formatSupabaseFunctionError } from '@/lib/supabase/functions';
import { supabase } from '@/lib/supabase/client';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import {
  catalogSelectionsEstimateCents,
  formatCatalogPrice,
  listCatalogSelections,
} from '@/lib/design-catalog';
import {
  DESIGN_STYLE_OPTIONS,
  generateRenderUserMessage,
  shouldGenerateImagePreview,
  visualPreviewUnavailableMessage,
} from '@/lib/visual-preview';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { USDZViewer } from '@/components/room-scan';
import { RoomCustomizer3D } from '@/components/project/RoomCustomizer3D';
import { RoomMaterialCustomizer } from '@/components/project/RoomMaterialCustomizer';
import { GlassButton, GlassCard, GradientBackground, WizardHeader } from '@/components/ui';

type RenderRow = {
  id: string;
  url: string;
  selected?: boolean | null;
  style_params?: { design_style?: string; material_tier?: string; room_type?: string } | null;
};

export default function RendersStep() {
  const navigation = useNavigation<any>();
  const {
    projectId,
    answers,
    roomType,
    roomScanData,
    surfaceSelections,
    selectedRenderId,
    setSelectedRender,
    setSurfaceSelection,
  } = useProjectWizardStore();

  const [savingSelection, setSavingSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renders, setRenders] = useState<RenderRow[]>([]);
  const [loadingRenders, setLoadingRenders] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [renderMessage, setRenderMessage] = useState<string | null>(null);
  const generateStartedRef = useRef(false);

  const hasRoomModel = !!roomScanData;
  const preferNative3D = Platform.OS === 'ios' && hasRoomModel;
  const canGenerate = shouldGenerateImagePreview(projectId, roomScanData);
  const selectedRenderUrl =
    renders.find((r) => r.id === selectedRenderId)?.url
    ?? renders.find((r) => r.selected)?.url
    ?? renders[0]?.url
    ?? null;

  const [fullScreenVisible, setFullScreenVisible] = useState(false);
  const [fullScreenIndex, setFullScreenIndex] = useState(0);

  const openFullScreen = useCallback((index?: number) => {
    if (typeof index === 'number') {
      setFullScreenIndex(index);
    } else {
      const currentIdx = renders.findIndex((r) => r.id === selectedRenderId || r.url === selectedRenderUrl);
      setFullScreenIndex(currentIdx >= 0 ? currentIdx : 0);
    }
    setFullScreenVisible(true);
  }, [renders, selectedRenderId, selectedRenderUrl]);

  const catalogPicks = useMemo(
    () => listCatalogSelections(surfaceSelections),
    [surfaceSelections],
  );
  const catalogTotalCents = useMemo(
    () => catalogSelectionsEstimateCents(catalogPicks),
    [catalogPicks],
  );

  const applyRenders = useCallback((rows: RenderRow[]) => {
    if (!rows.length) return; // Keep existing gallery if generate returns empty / fails.
    setRenders(rows);
    const preferred = rows.find((r) => r.selected) ?? rows[0] ?? null;
    setSelectedRender(preferred?.id ?? null);
  }, [setSelectedRender]);

  const loadOrGenerateRenders = useCallback(async (opts?: { force?: boolean; style?: string }) => {
    if (!projectId || !canGenerate) return;
    const force = opts?.force === true;
    if (force) setRegenerating(true);
    else setLoadingRenders(true);
    setRenderMessage(null);

    try {
      const { measurements } = useProjectWizardStore.getState();
      const { data, error: fnError } = await supabase.functions.invoke('generate-render', {
        body: {
          project_id: projectId,
          questionnaire_answers: answers,
          measurements,
          surface_selections: surfaceSelections,
          force,
          style_override: opts?.style ?? null,
        },
      });
      if (fnError) throw new Error(await formatSupabaseFunctionError(fnError));

      const rows = (Array.isArray(data?.renders) ? data.renders : []) as RenderRow[];
      if (rows.length > 0) {
        applyRenders(rows);
        // After force regenerate, preview the newest selected / last image.
        if (force) {
          const newest = rows.find((r) => r.selected) ?? rows[rows.length - 1];
          if (newest) setSelectedRender(newest.id);
        }
      }
      const msg = generateRenderUserMessage(data);
      if (msg) setRenderMessage(msg);
    } catch (err) {
      setRenderMessage(visualPreviewUnavailableMessage(
        await formatSupabaseFunctionError(err, 'Could not generate design preview.'),
      ));
    } finally {
      setLoadingRenders(false);
      setRegenerating(false);
    }
  }, [answers, applyRenders, canGenerate, projectId, setSelectedRender, surfaceSelections]);

  useEffect(() => {
    if (!canGenerate || generateStartedRef.current) return;
    generateStartedRef.current = true;
    void loadOrGenerateRenders();
  }, [canGenerate, loadOrGenerateRenders]);

  const handleSelectRender = async (render: RenderRow) => {
    setSelectedRender(render.id);
    setRenders((prev) => prev.map((r) => ({ ...r, selected: r.id === render.id })));
    if (!projectId) return;
    try {
      const clear = await supabase.from('renders').update({ selected: false }).eq('project_id', projectId);
      if (clear.error) throw clear.error;
      const mark = await supabase.from('renders').update({ selected: true }).eq('id', render.id);
      if (mark.error) throw mark.error;
      const projectUpdate = await supabase
        .from('projects')
        .update({ selected_render_id: render.id })
        .eq('id', projectId);
      if (projectUpdate.error) throw projectUpdate.error;
      setError(null);
    } catch (err) {
      setError(formatAppSafeErrorMessage(err, 'Could not save your design selection. Try again.'));
    }
  };

  const surfaceEditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSurfaceSelect = useCallback((selection: Parameters<typeof setSurfaceSelection>[0]) => {
    setSurfaceSelection(selection);
    if (!projectId || !canGenerate) return;
    if (surfaceEditTimer.current) clearTimeout(surfaceEditTimer.current);
    surfaceEditTimer.current = setTimeout(() => {
      void (async () => {
        setRegenerating(true);
        setRenderMessage(null);
        try {
          const { data, error: fnError } = await supabase.functions.invoke('generate-render', {
            body: {
              project_id: projectId,
              questionnaire_answers: answers,
              force: true,
              surface_edit: {
                surface_label: selection.surfaceLabel,
                material: selection.material,
                color_name: selection.colorName ?? null,
                brand: selection.brand ?? null,
                sku: selection.sku ?? null,
                image_url: selection.imageUrl ?? null,
              },
            },
          });
          if (fnError) throw new Error(await formatSupabaseFunctionError(fnError));
          const rows = (Array.isArray(data?.renders) ? data.renders : []) as RenderRow[];
          if (rows.length > 0) {
            applyRenders(rows);
            const newest = rows.find((r) => r.selected) ?? rows[rows.length - 1];
            if (newest) setSelectedRender(newest.id);
          }
          const msg = generateRenderUserMessage(data);
          if (msg) setRenderMessage(msg);
          else if (rows.length > 0) {
            setRenderMessage(`Updated preview for ${selection.surfaceLabel}.`);
          }
        } catch (err) {
          setRenderMessage(visualPreviewUnavailableMessage(
            await formatSupabaseFunctionError(err, 'Could not update surface preview.'),
          ));
        } finally {
          setRegenerating(false);
        }
      })();
    }, 700);
  }, [answers, applyRenders, canGenerate, projectId, setSelectedRender, setSurfaceSelection]);

  useEffect(() => () => {
    if (surfaceEditTimer.current) clearTimeout(surfaceEditTimer.current);
  }, []);

  const handleNext = async () => {
    if (savingSelection) return;

    if (!projectId) {
      useProjectWizardStore.getState().setStep(6);
      navigation.navigate('Address');
      return;
    }

    setSavingSelection(true);
    setError(null);
    try {
      useProjectWizardStore.getState().setStep(6);
      navigation.navigate('Address');
    } catch (err) {
      setError(formatAppSafeErrorMessage(err, 'Could not continue.'));
    } finally {
      setSavingSelection(false);
    }
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <WizardHeader currentStep={5} />

          <Text style={styles.stepLabel}>STEP 5 OF 8</Text>
          <Text style={styles.title}>Design & Materials</Text>
          <Text style={styles.subtitle}>
            Walker AI recommends a finished look for your room. Browse styles, regenerate a new direction, then lock real supplier SKUs below.
          </Text>

          {canGenerate ? (
            <GlassCard style={styles.aiCard} padding={14}>
              <View style={styles.aiHeader}>
                <View style={styles.aiHeaderText}>
                  <Text style={styles.aiTitle}>Design & Style Inspiration</Text>
                  <Text style={styles.aiSubtitle}>
                    Photorealistic visual style inspiration. Final buildable scope and exact material quantities derive strictly from verified room measurements.
                  </Text>
                </View>
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles-outline" size={14} color={Colors.success} />
                  <Text style={styles.aiBadgeText}>Concept</Text>
                </View>
              </View>

              <View style={styles.disclaimerPill}>
                <Ionicons name="information-circle-outline" size={14} color={Colors.text.tertiary} />
                <Text style={styles.disclaimerText}>
                  Conceptual Style Preview — Field measurements govern construction.
                </Text>
              </View>

              {loadingRenders && renders.length === 0 ? (
                <View style={styles.aiLoading}>
                  <ActivityIndicator color={Colors.success} />
                  <Text style={styles.aiLoadingText}>Generating design options…</Text>
                </View>
              ) : null}

              {renders.length > 0 ? (
                <>
                  <Text style={styles.galleryHeading}>
                    {renders.length} design{renders.length === 1 ? '' : 's'} · tap to preview
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.renderStrip}
                  >
                    {renders.map((render, index) => {
                      const selected = selectedRenderId === render.id
                        || (!selectedRenderId && (render.selected || index === 0));
                      const styleLabel = String(render.style_params?.design_style ?? 'Design')
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                      return (
                        <TouchableOpacity
                          key={render.id}
                          style={[styles.renderThumbWrap, selected && styles.renderThumbSelected]}
                          onPress={() => {
                            if (selected) {
                              openFullScreen(index);
                            } else {
                              handleSelectRender(render);
                            }
                          }}
                          activeOpacity={0.85}
                        >
                          <View>
                            <Image source={{ uri: render.url }} style={styles.renderThumb} />
                            {index === 0 ? (
                              <View style={styles.recommendedPill}>
                                <Text style={styles.recommendedPillText}>Recommended</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={[styles.renderLabel, selected && styles.renderLabelSelected]} numberOfLines={1}>
                            {index === 0 ? 'Recommended' : styleLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {selectedRenderUrl ? (
                    <View style={styles.heroWrap}>
                      <View style={styles.heroHeaderRow}>
                        <Text style={styles.heroCaption}>Selected preview</Text>
                        <TouchableOpacity
                          style={styles.expandHintBtn}
                          onPress={() => openFullScreen()}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="scan-outline" size={13} color={Colors.success} />
                          <Text style={styles.expandHintText}>View Full Screen</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={styles.heroTouchable}
                        onPress={() => openFullScreen()}
                        activeOpacity={0.9}
                      >
                        <Image source={{ uri: selectedRenderUrl }} style={styles.renderHero} />
                        <View style={styles.heroExpandOverlay}>
                          <Ionicons name="expand-outline" size={14} color="#fff" />
                          <Text style={styles.heroExpandText}>Tap for full screen</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.styleHeading}>Browse styles</Text>
              <View style={styles.styleRow}>
                {DESIGN_STYLE_OPTIONS.map((style) => (
                  <TouchableOpacity
                    key={style.id}
                    style={styles.styleChip}
                    disabled={loadingRenders || regenerating}
                    onPress={() => loadOrGenerateRenders({ force: true, style: style.id })}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.styleChipText}>{style.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <GlassButton
                label={regenerating ? 'Generating new design…' : 'Scrap & generate new design'}
                onPress={() => loadOrGenerateRenders({ force: true })}
                loading={regenerating}
                disabled={loadingRenders}
                fullWidth
                size="md"
                variant="secondary"
                style={{ marginTop: 12 }}
              />

              {renderMessage ? <Text style={styles.renderMessage}>{renderMessage}</Text> : null}
            </GlassCard>
          ) : (
            <GlassCard style={styles.aiCard} padding={14}>
              <Text style={styles.aiTitle}>Design preview</Text>
              <Text style={styles.aiSubtitle}>
                Save the project with room photos to generate a photoreal Walker AI recommendation.
              </Text>
            </GlassCard>
          )}

          {preferNative3D ? (
            <RoomCustomizer3D
              roomType={roomType}
              scanData={roomScanData}
              selections={surfaceSelections}
              answers={answers}
              onSelect={handleSurfaceSelect}
            />
          ) : null}

          {hasRoomModel && !preferNative3D ? (
            <GlassCard style={styles.modelCard} padding={14}>
              <View style={styles.modelHeader}>
                <View style={styles.modelHeaderText}>
                  <Text style={styles.modelTitle} numberOfLines={1}>Measured Room Model</Text>
                  <Text style={styles.modelSubtitle} numberOfLines={2}>Scanned 3D room reference</Text>
                </View>
                <View style={styles.modelBadge}>
                  <Ionicons name="cube-outline" size={14} color={Colors.success} />
                  <Text style={styles.modelBadgeText}>Scanned</Text>
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
          ) : null}

          <RoomMaterialCustomizer
            roomType={roomType}
            selections={surfaceSelections}
            answers={answers}
            onSelect={handleSurfaceSelect}
            compact={preferNative3D}
          />

          {catalogPicks.length > 0 ? (
            <GlassCard style={styles.summaryCard} padding={14}>
              <Text style={styles.summaryTitle}>Selected Walker products</Text>
              <Text style={styles.summaryHint}>
                {catalogPicks.length} SKU{catalogPicks.length === 1 ? '' : 's'} · catalog total{' '}
                {formatCatalogPrice(catalogTotalCents)}
              </Text>
              {catalogPicks.map((pick, index) => (
                <View
                  key={`${pick.surfaceId}-${pick.catalogItemId}`}
                  style={[
                    styles.summaryRow,
                    index === catalogPicks.length - 1 && styles.summaryRowLast,
                  ]}
                >
                  {pick.imageUrl ? (
                    <Image source={{ uri: pick.imageUrl }} style={styles.summaryThumb} />
                  ) : (
                    <View style={[styles.summaryThumb, styles.summaryThumbEmpty]} />
                  )}
                  <View style={styles.summaryBody}>
                    <Text style={styles.summarySurface} numberOfLines={1}>{pick.surfaceLabel}</Text>
                    <Text style={styles.summaryProduct} numberOfLines={2}>{pick.material}</Text>
                    <Text style={styles.summaryMeta} numberOfLines={1}>
                      {[pick.sku ? `SKU ${pick.sku}` : null, formatCatalogPrice(pick.priceCents)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
              ))}
            </GlassCard>
          ) : (
            <GlassCard style={styles.emptyCard} padding={14}>
              <Ionicons name="storefront-outline" size={36} color={Colors.text.tertiary} style={{ alignSelf: 'center', marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>Choose products to continue strongly</Text>
              <Text style={styles.emptyNote}>
                Select at least one Walker catalog product above so contractors and suppliers see real SKUs in the brief. You can still continue with style presets only.
              </Text>
            </GlassCard>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <GlassButton
            label="Continue to Address"
            onPress={handleNext}
            loading={savingSelection}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </SafeAreaView>

      {/* Full-Screen Render Image Viewer Modal */}
      <Modal
        visible={fullScreenVisible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setFullScreenVisible(false)}
      >
        <View style={styles.fullScreenContainer}>
          <FlatList
            data={renders}
            keyExtractor={(item) => `fullscreen-render-${item.id}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={fullScreenIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              if (idx >= 0 && idx < renders.length) {
                setFullScreenIndex(idx);
                handleSelectRender(renders[idx]);
              }
            }}
            renderItem={({ item }) => (
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setFullScreenVisible(false)}
                style={styles.fullScreenImageWrapper}
              >
                <Image
                  source={{ uri: item.url }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            )}
          />

          <View style={styles.fullScreenHeader} pointerEvents="auto">
            <TouchableOpacity
              style={styles.fullScreenCloseBtn}
              onPress={() => setFullScreenVisible(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={styles.fullScreenTitleWrap} pointerEvents="none">
              <Text style={styles.fullScreenTitle} numberOfLines={1}>
                {renders[fullScreenIndex]?.style_params?.design_style
                  ? String(renders[fullScreenIndex].style_params?.design_style)
                      .replace(/-/g, ' ')
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                  : 'Renovation Render'}
              </Text>
              {renders.length > 1 && (
                <Text style={styles.fullScreenCounter}>
                  {fullScreenIndex + 1} of {renders.length} · Swipe to explore
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.fullScreenDoneBtn}
              onPress={() => setFullScreenVisible(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Text style={styles.fullScreenDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  aiCard: { marginBottom: Spacing.lg },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  aiHeaderText: { flex: 1, minWidth: 0 },
  aiTitle: { ...Typography.h3 },
  aiSubtitle: { ...Typography.caption, marginTop: 3, lineHeight: 17 },
  aiBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    minHeight: 28,
  },
  aiBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  disclaimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: Radius.item,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
    marginBottom: 12,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.text.tertiary,
    flex: 1,
    lineHeight: 15,
  },
  aiLoading: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.bg.primary,
    borderRadius: Radius.item,
  },
  aiLoadingText: { ...Typography.caption },
  galleryHeading: { ...Typography.label, color: Colors.text.tertiary, marginBottom: 8 },
  renderStrip: { gap: 10, paddingBottom: 12 },
  renderThumbWrap: {
    width: 120,
    borderRadius: Radius.item,
    borderWidth: 1.5,
    borderColor: Colors.glass.border,
    overflow: 'hidden',
    backgroundColor: Colors.bg.primary,
  },
  renderThumbSelected: {
    borderColor: Colors.success,
  },
  renderThumb: { width: 120, height: 90 },
  recommendedPill: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 107, 0, 0.92)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  recommendedPillText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  renderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  renderLabelSelected: { color: Colors.text.primary },
  heroWrap: { marginBottom: 12 },
  heroHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expandHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
  },
  expandHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.success,
  },
  heroTouchable: {
    position: 'relative',
    borderRadius: Radius.item,
    overflow: 'hidden',
  },
  heroExpandOverlay: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroExpandText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  heroCaption: { ...Typography.label, color: Colors.text.tertiary },
  renderHero: {
    width: '100%',
    height: 240,
    borderRadius: Radius.item,
    backgroundColor: Colors.bg.primary,
  },
  styleHeading: { ...Typography.label, color: Colors.text.tertiary, marginBottom: 8 },
  styleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  styleChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  styleChipText: { fontSize: 12, fontWeight: '600', color: Colors.text.secondary },
  renderMessage: { ...Typography.caption, color: Colors.error, marginTop: 10, lineHeight: 17 },
  emptyCard: { marginBottom: Spacing.lg, alignItems: 'center', paddingVertical: Spacing.sm },
  emptyTitle: { ...Typography.h3, marginBottom: 8, textAlign: 'center' },
  emptyNote: { ...Typography.bodySecondary, textAlign: 'center', lineHeight: 20 },
  summaryCard: { marginBottom: Spacing.lg },
  summaryTitle: { ...Typography.h3, marginBottom: 4 },
  summaryHint: { ...Typography.caption, marginBottom: 12 },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.glass.border,
  },
  summaryRowLast: {
    marginBottom: 0,
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  summaryThumb: { width: 44, height: 44, borderRadius: 8 },
  summaryThumbEmpty: { backgroundColor: 'rgba(255,255,255,0.08)' },
  summaryBody: { flex: 1, minWidth: 0 },
  summarySurface: { fontSize: 11, fontWeight: '700', color: Colors.success, marginBottom: 2 },
  summaryProduct: { fontSize: 13, fontWeight: '700', color: Colors.text.primary },
  summaryMeta: { ...Typography.caption, marginTop: 2 },
  modelCard: { marginBottom: Spacing.lg },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  modelHeaderText: { flex: 1, minWidth: 0 },
  modelTitle: { ...Typography.h3 },
  modelSubtitle: { ...Typography.caption, marginTop: 2 },
  modelBadge: {
    minHeight: 28,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.25)',
    backgroundColor: 'rgba(255, 107, 0, 0.08)',
    paddingHorizontal: 10,
  },
  modelBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.success },
  modelViewer: {
    height: 260,
    borderRadius: Radius.item,
    overflow: 'hidden',
    backgroundColor: Colors.bg.primary,
  },
  modelViewerInner: { borderRadius: Radius.item },
  errorText: { marginBottom: 12, ...Typography.caption, color: Colors.error },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 28,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  fullScreenCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 25,
  },
  fullScreenDoneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 25,
  },
  fullScreenDoneText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  fullScreenTitleWrap: {
    alignItems: 'center',
    maxWidth: SCREEN_WIDTH - 140,
  },
  fullScreenTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  fullScreenCounter: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  fullScreenImageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});
