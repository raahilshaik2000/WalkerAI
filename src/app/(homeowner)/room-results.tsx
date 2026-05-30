import React, { useState } from 'react';
import {
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
  const { scanData, fromWizard } = route.params ?? {};
  const [viewMode, setViewMode] = useState<ViewMode>('floorplan');
  const [editOpen, setEditOpen] = useState(false);
  const [roomDimensions, setRoomDimensions] = useState(() => scanData.roomDimensions ?? {});
  const [draftDimensions, setDraftDimensions] = useState({
    length: String(scanData.roomDimensions?.length ?? ''),
    width: String(scanData.roomDimensions?.width ?? ''),
    height: String(scanData.roomDimensions?.height ?? ''),
  });
  const { setMeasurements } = useProjectWizardStore();

  function handleUseMeasurements() {
    const rd = roomDimensions ?? {};
    setMeasurements({
      lengthFt: rd.length ? (rd.length * M_TO_FT).toFixed(1) : '',
      widthFt: rd.width ? (rd.width * M_TO_FT).toFixed(1) : '',
      ceilingHeightFt: rd.height ? (rd.height * M_TO_FT).toFixed(1) : '',
      numDoors: String(scanData.doors?.length ?? 0),
      numWindows: String(scanData.windows?.length ?? 0),
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
    useProjectWizardStore.getState().setStep(3);
    navigation.navigate('ProjectCreate', { screen: 'Analyzing' });
  }

  function saveCorrections() {
    const length = parseDimension(draftDimensions.length);
    const width = parseDimension(draftDimensions.width);
    const height = parseDimension(draftDimensions.height);
    setRoomDimensions({
      length: Number.isFinite(length) && length > 0 ? length : roomDimensions.length,
      width: Number.isFinite(width) && width > 0 ? width : roomDimensions.width,
      height: Number.isFinite(height) && height > 0 ? height : roomDimensions.height,
      area: Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0
        ? length * width
        : roomDimensions.area,
    });
    setEditOpen(false);
  }

  const { walls = [], doors = [], windows = [], objects = [], usdzFilePath, isMock } = scanData;

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
                <USDZViewer filePath={usdzFilePath} scanData={scanData} style={{ flex: 1 }} />
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
                Showing simulated data. Scan a real room on a LiDAR device for actual measurements.
              </Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom CTA */}
        <View style={styles.bottom}>
          {fromWizard ? (
            <GlassButton
              label="Use These Measurements"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleUseMeasurements}
              icon={<Ionicons name="checkmark-circle" size={20} color="#000" />}
            />
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

function parseDimension(value: string) {
  const normalized = value
    .replace(/[٫٬,·•]/g, '.')
    .replace(/[^\d.-]/g, '');

  return Number.parseFloat(normalized);
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
        placeholder="0.0"
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
  modalPrimaryText: { color: '#000', fontWeight: '800' },
});
