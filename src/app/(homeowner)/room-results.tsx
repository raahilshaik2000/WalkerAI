import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  ViewStyle,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { AnimatedPressable, GlassButton, GradientBackground } from '@/components/ui';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { parseMetricDimension } from '@/lib/measurements';
import { getRoomScanMeasurementBlocker, getRoomScanQualityWarnings, scanHasUsdzMesh } from '@/lib/room-scan';
import { normalizeFloorPlan } from '@/lib/room-scan/normalizeFloorPlan';
import {
  FloorPlanView,
  USDZViewer,
  MeasurementCard,
  RoomSummaryCard,
} from '@/components/room-scan';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PLAN_SIZE = SCREEN_WIDTH - Spacing.sm * 2;

type ViewMode = 'floorplan' | '3d';

const M_TO_FT = 3.28084;

export default function RoomResultsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { scanData: routeScanData, fromWizard } = route.params ?? {};
  const scanData = routeScanData && typeof routeScanData === 'object' ? routeScanData : null;
  const safeScanData = useMemo(() => scanData ?? {}, [scanData]);
  const [viewMode, setViewMode] = useState<ViewMode>('floorplan');
  const [editOpen, setEditOpen] = useState(false);
  const canonicalDimensions = useMemo(() => {
    const rawDims = safeScanData.roomDimensions ?? {};
    const walls = Array.isArray(safeScanData.walls) ? safeScanData.walls : [];
    if (walls.length >= 3) {
      const plan = normalizeFloorPlan(walls);
      if (plan.bounds && plan.bounds.roomW > 0.5 && plan.bounds.roomH > 0.5) {
        const spanW = Number(plan.bounds.roomW.toFixed(2));
        const spanH = Number(plan.bounds.roomH.toFixed(2));
        const trueLength = Math.max(spanW, spanH);
        const trueWidth = Math.min(spanW, spanH);
        const rawLength = typeof rawDims.length === 'number' ? rawDims.length : 0;
        const rawWidth = typeof rawDims.width === 'number' ? rawDims.width : 0;

        // An unrotated AABB is inflated by up to sqrt(2) (~41%) when the room is scanned at an angle.
        // If raw AABB is inflated (>5% larger than the true orthogonal wall spans), prefer true wall dimensions.
        const isInflated =
          rawLength > trueLength * 1.05 ||
          rawWidth > trueWidth * 1.05 ||
          (typeof rawDims.area === 'number' && rawDims.area > trueLength * trueWidth * 1.1);

        if (isInflated || !rawLength || !rawWidth) {
          const height = typeof rawDims.height === 'number' && rawDims.height > 0 ? rawDims.height : 2.7;
          return {
            length: trueLength,
            width: trueWidth,
            height,
            area: Number((trueLength * trueWidth).toFixed(2)),
          };
        }
      }
    }
    return rawDims;
  }, [safeScanData]);

  const [roomDimensions, setRoomDimensions] = useState(() => canonicalDimensions);
  const [draftDimensions, setDraftDimensions] = useState({
    length: String(canonicalDimensions?.length ?? ''),
    width: String(canonicalDimensions?.width ?? ''),
    height: String(canonicalDimensions?.height ?? ''),
  });

  useEffect(() => {
    setRoomDimensions(canonicalDimensions);
    setDraftDimensions({
      length: String(canonicalDimensions?.length ?? ''),
      width: String(canonicalDimensions?.width ?? ''),
      height: String(canonicalDimensions?.height ?? ''),
    });
  }, [canonicalDimensions]);
  const { setMeasurements, setRoomScanData } = useProjectWizardStore();

  const correctedScanData = {
    ...safeScanData,
    roomDimensions,
  };
  const measurementBlocker = getRoomScanMeasurementBlocker(correctedScanData);
  const qualityWarnings = getRoomScanQualityWarnings(correctedScanData);
  const hasUsdz = scanHasUsdzMesh(correctedScanData);

  function handleUseMeasurements() {
    if (measurementBlocker) {
      Alert.alert('Measurements required', measurementBlocker);
      return;
    }

    if (qualityWarnings.length > 0 && !hasUsdz) {
      Alert.alert(
        'Scan needs another pass',
        `${qualityWarnings[0]}\n\nA complete RoomPlan scan unlocks accurate 3D. Rescan, or continue with measurements only.`,
        [
          { text: 'Rescan', style: 'cancel', onPress: () => navigation.goBack() },
          {
            text: 'Continue anyway',
            style: 'destructive',
            onPress: () => commitMeasurementsAndContinue(),
          },
        ],
      );
      return;
    }

    if (qualityWarnings.length > 0) {
      Alert.alert(
        'Scan quality tip',
        `${qualityWarnings[0]}\n\nYou can continue, but a cleaner rescan improves 3D accuracy.`,
        [
          { text: 'Rescan', style: 'cancel', onPress: () => navigation.goBack() },
          { text: 'Continue', onPress: () => commitMeasurementsAndContinue() },
        ],
      );
      return;
    }

    commitMeasurementsAndContinue();
  }

  function commitMeasurementsAndContinue() {
    const rd = roomDimensions ?? {};
    setMeasurements({
      lengthFt: rd.length ? (rd.length * M_TO_FT).toFixed(1) : '',
      widthFt: rd.width ? (rd.width * M_TO_FT).toFixed(1) : '',
      ceilingHeightFt: rd.height ? (rd.height * M_TO_FT).toFixed(1) : '',
      numDoors: String(safeScanData.doors?.length ?? 0),
      numWindows: String(safeScanData.windows?.length ?? 0),
      upperCabHeight: '',
      lowerCabHeight: '',
      cabDepth: '',
      upperLinearFt: '',
      lowerLinearFt: '',
      countertopLinearFt: '',
      doorWidth: '',
      doorHeight: '',
      windowWidth: '',
      windowHeight: '',
      fridgeWidth: '',
      rangeWidth: '',
      hasDishwasher: false,
      hasIsland: false,
      islandLength: '',
      islandWidth: '',
    });
    setRoomScanData(correctedScanData);
    useProjectWizardStore.getState().setStep(3);
    navigation.navigate('ProjectCreate', { screen: 'Analyzing' });
  }

  function saveCorrections() {
    const invalidFields = [
      ['length', draftDimensions.length],
      ['width', draftDimensions.width],
      ['height', draftDimensions.height],
    ]
      .filter(([, value]) => String(value).trim().length > 0 && parseMetricDimension(String(value)) == null)
      .map(([label]) => label);

    if (invalidFields.length > 0) {
      Alert.alert(
        'Invalid measurements',
        `Enter valid positive numbers for: ${invalidFields.join(', ')}.`
      );
      return;
    }

    const length = parseMetricDimension(draftDimensions.length);
    const width = parseMetricDimension(draftDimensions.width);
    const height = parseMetricDimension(draftDimensions.height);
    setRoomDimensions({
      length: length ?? roomDimensions.length,
      width: width ?? roomDimensions.width,
      height: height ?? roomDimensions.height,
      area: length != null && width != null
        ? length * width
        : roomDimensions.area,
    });
    setEditOpen(false);
  }

  const { walls = [], doors = [], windows = [], objects = [], usdzFilePath, isMock } = safeScanData;

  if (!scanData) {
    return (
      <GradientBackground>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Room Measurements</Text>
            <GlassButton
              label=""
              variant="ghost"
              size="sm"
              onPress={() => navigation.goBack()}
              icon={<Ionicons name="close" size={22} color="#FFFFFF" />}
            />
          </View>
          <View style={styles.unavailableState}>
            <View style={styles.unavailableIcon}>
              <Ionicons name="scan-outline" size={30} color={Colors.text.tertiary} />
            </View>
            <Text style={styles.unavailableTitle}>Measurement data unavailable</Text>
            <Text style={styles.unavailableBody}>
              Reopen this screen from a completed room scan or enter measurements manually in the project flow.
            </Text>
            <GlassButton
              label="Go Back"
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => navigation.goBack()}
            />
          </View>
        </SafeAreaView>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Room Measurements</Text>
          <GlassButton
            label=""
            variant="ghost"
            size="sm"
            onPress={() => navigation.goBack()}
            icon={<Ionicons name="close" size={22} color="#FFFFFF" />}
          />
        </View>

        {/* View Mode Toggle — 3D only available on iOS */}
        {Platform.OS === 'ios' ? (
          <View style={styles.toggleRow}>
            <ToggleButton
              label="Floor Plan"
              icon="map-outline"
              active={viewMode === 'floorplan'}
              onPress={() => setViewMode('floorplan')}
            />
            <View style={{ width: 8 }} />
            <ToggleButton
              label="3D View"
              icon="cube-outline"
              active={viewMode === '3d'}
              onPress={() => setViewMode('3d')}
            />
          </View>
        ) : (
          <View style={styles.toggleRow}>
            <ToggleButton
              label="Floor Plan"
              icon="map-outline"
              active={true}
              onPress={() => {}}
            />
          </View>
        )}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Visualization */}
          <View style={styles.vizContainer}>
            {viewMode === 'floorplan' ? (
              <FloorPlanView
                walls={walls}
                doors={doors}
                windows={windows}
                size={PLAN_SIZE}
              />
            ) : (
              <View style={{ width: PLAN_SIZE, height: PLAN_SIZE }}>
                <USDZViewer filePath={usdzFilePath} scanData={correctedScanData} style={{ flex: 1 }} />
              </View>
            )}
          </View>

          {/* Legend */}
          {viewMode === 'floorplan' && (
            <View style={styles.legend}>
              <LegendItem color="#FFFFFF" label="Walls" />
              <LegendItem color="#34D399" label="Doors" />
              <LegendItem color="#60A5FA" label="Windows" />
              <LegendItem color="#FF6B00" label="Dimensions" />
            </View>
          )}

          {/* Room Summary */}
          <RoomSummaryCard
            length={roomDimensions?.length ?? 0}
            width={roomDimensions?.width ?? 0}
            height={roomDimensions?.height ?? 0}
            area={roomDimensions?.area ?? 0}
            wallCount={walls.length}
            doorCount={doors.length}
            windowCount={windows.length}
          />

          {qualityWarnings.length > 0 && (
            <View style={styles.qualityCard}>
              <View style={styles.qualityHeader}>
                <Ionicons name="warning-outline" size={18} color="#FBBF24" />
                <Text style={styles.qualityTitle}>
                  {hasUsdz ? 'Scan quality tips' : 'Rescan recommended for accurate 3D'}
                </Text>
              </View>
              {qualityWarnings.map((warning) => (
                <Text key={warning} style={styles.qualityBody}>• {warning}</Text>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.adjustCard} activeOpacity={0.8} onPress={() => setEditOpen(true)}>
            <View style={styles.adjustIcon}>
              <Ionicons name="create-outline" size={18} color="#06B6D4" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.adjustTitle}>Adjust measurements</Text>
              <Text style={styles.adjustBody}>Correct the scan before using it for estimates.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
          </TouchableOpacity>

          {/* Wall Measurements */}
          {walls.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Walls</Text>
              {walls.map((wall: any, i: number) => (
                <MeasurementCard
                  key={wall.id}
                  icon="square-outline"
                  iconColor="#FFFFFF"
                  label={`Wall ${i + 1}`}
                  dimensions={`${wall.width.toFixed(1)}m × ${wall.height.toFixed(1)}m`}
                />
              ))}
            </>
          )}

          {/* Doors */}
          {doors.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Doors</Text>
              {doors.map((door: any, i: number) => (
                <MeasurementCard
                  key={door.id}
                  icon="enter-outline"
                  iconColor="#34D399"
                  label={`Door ${i + 1}`}
                  dimensions={`${door.width.toFixed(1)}m × ${door.height.toFixed(1)}m`}
                />
              ))}
            </>
          )}

          {/* Windows */}
          {windows.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Windows</Text>
              {windows.map((win: any, i: number) => (
                <MeasurementCard
                  key={win.id}
                  icon="browsers-outline"
                  iconColor="#60A5FA"
                  label={`Window ${i + 1}`}
                  dimensions={`${win.width.toFixed(1)}m × ${win.height.toFixed(1)}m`}
                />
              ))}
            </>
          )}

          {/* Objects */}
          {objects.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Detected Objects</Text>
              {objects.map((obj: any, i: number) => (
                <MeasurementCard
                  key={obj.id || `obj_${i}`}
                  icon="cube-outline"
                  iconColor="#A78BFA"
                  label={obj.category}
                  dimensions={`${obj.width.toFixed(1)} × ${obj.depth?.toFixed(1) ?? '?'}m`}
                  subtitle={`Height: ${obj.height.toFixed(1)}m`}
                />
              ))}
            </>
          )}

          {Platform.OS === 'android' && !isMock && (
            <View style={styles.mockBanner}>
              <Ionicons name="information-circle-outline" size={16} color="#FF6B00" />
              <Text style={styles.mockText}>
                Measurements are approximate (±10-20cm). For precise measurements, use a tape measure or laser device.
              </Text>
            </View>
          )}

          {isMock && (
            <View style={styles.mockBanner}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.text.tertiary} />
              <Text style={styles.mockText}>
                Showing simulated data. Enter manual measurements or scan a real room before creating an estimate.
              </Text>
            </View>
          )}

          {fromWizard && measurementBlocker && (
            <View style={styles.blockerCard}>
              <Ionicons name="alert-circle-outline" size={16} color="#FF6B00" style={styles.blockerIcon} />
              <Text style={styles.blockerText}>{measurementBlocker}</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom CTA */}
        <View style={styles.bottom}>
          {fromWizard ? (
            measurementBlocker ? (
              <GlassButton
                label="Enter Measurements Manually"
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => navigation.replace('ManualMeasurement', { fromWizard: true })}
                icon={<Ionicons name="create-outline" size={20} color="#000" />}
              />
            ) : (
              <GlassButton
                label="Use These Measurements"
                variant="primary"
                size="lg"
                fullWidth
                onPress={handleUseMeasurements}
                icon={<Ionicons name="checkmark-circle" size={20} color="#000" />}
              />
            )
          ) : (
            <GlassButton
              label="Done"
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'HomeownerTabs' }] })}
              icon={<Ionicons name="checkmark" size={20} color="#000" />}
            />
          )}
        </View>

        <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Adjust Measurements</Text>
              <Text style={styles.modalBody}>Values are stored in meters and converted to feet for the estimate.</Text>

              <View style={styles.inputRow}>
                <DimensionInput style={styles.rowField} label="Length" value={draftDimensions.length} onChangeText={(length) => setDraftDimensions((d) => ({ ...d, length }))} />
                <DimensionInput style={styles.rowField} label="Width" value={draftDimensions.width} onChangeText={(width) => setDraftDimensions((d) => ({ ...d, width }))} />
              </View>
              <DimensionInput label="Ceiling Height" value={draftDimensions.height} onChangeText={(height) => setDraftDimensions((d) => ({ ...d, height }))} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalSecondary} onPress={() => setEditOpen(false)}>
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalPrimary} onPress={saveCorrections}>
                  <Text style={styles.modalPrimaryText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </GradientBackground>
  );
}

function DimensionInput({
  label,
  value,
  onChangeText,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.dimensionField, style]}>
      <Text style={styles.dimensionLabel}>{label}</Text>
      <TextInput
        style={styles.dimensionInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder=""
        placeholderTextColor={Colors.text.tertiary}
      />
    </View>
  );
}

function ToggleButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.toggle, active && styles.toggleActive]}
    >
      <Ionicons name={icon} size={16} color={active ? '#000' : Colors.text.secondary} />
      <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{label}</Text>
    </AnimatedPressable>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  headerTitle: Typography.h2,
  unavailableState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 12,
  },
  unavailableIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  unavailableTitle: { ...Typography.h3, textAlign: 'center' },
  unavailableBody: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.default,
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  toggleActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  toggleLabel: {
    ...Typography.h3,
    fontSize: 14,
    color: Colors.text.secondary,
    marginLeft: 6,
  },
  toggleLabelActive: { color: '#000000' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.sm },
  vizContainer: {
    marginBottom: Spacing.sm,
    alignItems: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    gap: 16,
  },
  qualityCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    gap: 6,
  },
  qualityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  qualityTitle: {
    ...Typography.body,
    fontWeight: '600',
    color: '#FBBF24',
    flex: 1,
  },
  qualityBody: {
    ...Typography.caption,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendLabel: { ...Typography.caption, fontSize: 11 },
  adjustCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: 14,
    marginBottom: Spacing.sm,
  },
  adjustIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustTitle: { ...Typography.h3, fontSize: 15, marginBottom: 2 },
  adjustBody: { ...Typography.caption, color: Colors.text.tertiary },
  sectionTitle: {
    ...Typography.h3,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: Radius.item,
    padding: 12,
    marginTop: Spacing.sm,
  },
  mockText: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    marginLeft: 8,
    flex: 1,
  },
  blockerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.28)',
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    padding: 12,
    marginTop: Spacing.sm,
  },
  blockerIcon: {
    marginTop: 2,
  },
  blockerText: {
    flex: 1,
    color: Colors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  modalCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.border,
    padding: Spacing.md,
  },
  modalTitle: { ...Typography.h2, marginBottom: 6 },
  modalBody: { ...Typography.bodySecondary, marginBottom: Spacing.md },
  inputRow: { flexDirection: 'row', gap: 10 },
  rowField: { flex: 1 },
  dimensionField: { marginBottom: 12 },
  dimensionLabel: { ...Typography.label, marginBottom: 6 },
  dimensionInput: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    color: Colors.text.primary,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalSecondary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: Radius.item,
    backgroundColor: Colors.glass.surface,
  },
  modalSecondaryText: { color: Colors.text.secondary, fontWeight: '700' },
  modalPrimary: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: Radius.item,
    backgroundColor: Colors.accent,
  },
  modalPrimaryText: { color: Colors.accentFg, fontWeight: '800' },
});
