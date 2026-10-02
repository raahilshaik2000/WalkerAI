import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useProjectWizardStore } from '@/stores/project-wizard.store';
import { isValidOptionalCount, isValidOptionalMetricDimension } from '@/lib/measurements';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { GlassButton, GradientBackground, WizardHeader } from '@/components/ui';

// ─── Reusable field components ───────────────────────────────────────────────

function Field({
  label,
  hint,
  value,
  onChangeText,
  unit = 'ft',
  keyboardType = 'decimal-pad',
  placeholder = '',
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  unit?: string;
  keyboardType?: 'decimal-pad' | 'number-pad';
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={Colors.text.tertiary}
          selectionColor="#FF6B00"
          maxLength={6}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.glass.border, true: 'rgba(255,107,0,0.5)' }}
        thumbColor={value ? '#FF6B00' : '#888'}
      />
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={15} color="#FF6B00" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Divider() {
  return <View style={styles.divider} />;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function MeasurementsStep() {
  const navigation = useNavigation<any>();
  const { measurements, setMeasurements, setRoomScanData, roomType } = useProjectWizardStore();
  const isBathroom = roomType === 'bathroom';
  const saved = measurements;

  // Room
  const [roomLength, setRoomLength] = useState(saved?.lengthFt ?? '');
  const [roomWidth, setRoomWidth] = useState(saved?.widthFt ?? '');
  const [ceilingHeight, setCeilingHeight] = useState(saved?.ceilingHeightFt ?? '');

  // Cabinets (kitchen)
  const [upperCabHeight, setUpperCabHeight] = useState(saved?.upperCabHeight ?? '');
  const [lowerCabHeight, setLowerCabHeight] = useState(saved?.lowerCabHeight ?? '');
  const [cabDepth, setCabDepth] = useState(saved?.cabDepth ?? '');
  const [upperLinearFt, setUpperLinearFt] = useState(saved?.upperLinearFt ?? '');
  const [lowerLinearFt, setLowerLinearFt] = useState(saved?.lowerLinearFt ?? '');

  // Countertops (kitchen)
  const [countertopLinearFt, setCountertopLinearFt] = useState(saved?.countertopLinearFt ?? '');

  // Doors & Windows
  const [numDoors, setNumDoors] = useState(saved?.numDoors ?? '');
  const [doorWidth, setDoorWidth] = useState(saved?.doorWidth ?? '');
  const [doorHeight, setDoorHeight] = useState(saved?.doorHeight ?? '');
  const [numWindows, setNumWindows] = useState(saved?.numWindows ?? '');
  const [windowWidth, setWindowWidth] = useState(saved?.windowWidth ?? '');
  const [windowHeight, setWindowHeight] = useState(saved?.windowHeight ?? '');

  // Appliances (kitchen)
  const [fridgeWidth, setFridgeWidth] = useState(saved?.fridgeWidth ?? '');
  const [rangeWidth, setRangeWidth] = useState(saved?.rangeWidth ?? '');
  const [hasDishwasher, setHasDishwasher] = useState(saved?.hasDishwasher ?? false);

  // Island (kitchen)
  const [hasIsland, setHasIsland] = useState(saved?.hasIsland ?? false);
  const [islandLength, setIslandLength] = useState(saved?.islandLength ?? '');
  const [islandWidth, setIslandWidth] = useState(saved?.islandWidth ?? '');

  // Shower / Tub (bathroom)
  const [hasShowerTub, setHasShowerTub] = useState(saved?.hasShowerTub ?? false);
  const [showerLength, setShowerLength] = useState(saved?.showerLength ?? '');
  const [showerWidth, setShowerWidth] = useState(saved?.showerWidth ?? '');

  // Vanity (bathroom)
  const [vanityWidth, setVanityWidth] = useState(saved?.vanityWidth ?? '');
  const [numSinks, setNumSinks] = useState(saved?.numSinks ?? '');

  // Tile (bathroom)
  const [floorTileArea, setFloorTileArea] = useState(saved?.floorTileArea ?? '');
  const [wallTileArea, setWallTileArea] = useState(saved?.wallTileArea ?? '');
  const [showAdvanced, setShowAdvanced] = useState(() => {
    if (!saved) return false;
    const advancedValues = isBathroom
      ? [saved.showerLength, saved.showerWidth, saved.vanityWidth, saved.numSinks, saved.floorTileArea, saved.wallTileArea]
      : [
        saved.upperCabHeight, saved.lowerCabHeight, saved.cabDepth, saved.upperLinearFt, saved.lowerLinearFt,
        saved.countertopLinearFt, saved.fridgeWidth, saved.rangeWidth, saved.islandLength, saved.islandWidth,
        saved.doorWidth, saved.doorHeight, saved.windowWidth, saved.windowHeight,
      ];
    return advancedValues.some(Boolean) || !!saved.hasIsland || !!saved.hasDishwasher || !!saved.hasShowerTub;
  });
  const [submitting, setSubmitting] = useState(false);

  const kitchenValues = [
    upperCabHeight, lowerCabHeight, cabDepth, upperLinearFt, lowerLinearFt,
    countertopLinearFt, fridgeWidth, rangeWidth, islandLength, islandWidth,
  ];
  const bathroomValues = [showerLength, showerWidth, vanityWidth, numSinks, floorTileArea, wallTileArea];

  const hasAnyValue = [
    roomLength, roomWidth, ceilingHeight,
    numDoors, doorWidth, doorHeight, numWindows, windowWidth, windowHeight,
    ...(isBathroom ? bathroomValues : kitchenValues),
  ].some(Boolean) || hasDishwasher || hasIsland || hasShowerTub;

  const invalidMeasurementLabels = () => {
    const dimensionFields = [
      ['room length', roomLength],
      ['room width', roomWidth],
      ['ceiling height', ceilingHeight],
      ['door width', doorWidth],
      ['door height', doorHeight],
      ['window width', windowWidth],
      ['window height', windowHeight],
      ...(isBathroom
        ? [
            ['shower/tub length', showerLength],
            ['shower/tub width', showerWidth],
            ['vanity width', vanityWidth],
            ['floor tile area', floorTileArea],
            ['wall tile area', wallTileArea],
          ]
        : [
            ['upper cabinet height', upperCabHeight],
            ['lower cabinet height', lowerCabHeight],
            ['cabinet depth', cabDepth],
            ['upper cabinet run', upperLinearFt],
            ['lower cabinet run', lowerLinearFt],
            ['countertop length', countertopLinearFt],
            ['fridge opening width', fridgeWidth],
            ['range/cooktop width', rangeWidth],
            ['island length', islandLength],
            ['island width', islandWidth],
          ]),
    ];

    const countFields = [
      ['number of doors', numDoors],
      ['number of windows', numWindows],
      ...(isBathroom ? [['number of sinks', numSinks]] : []),
    ];

    return [
      ...dimensionFields
        .filter(([, value]) => !isValidOptionalMetricDimension(value))
        .map(([label]) => label),
      ...countFields
        .filter(([, value]) => !isValidOptionalCount(value))
        .map(([label]) => label),
    ];
  };

  const handleContinue = () => {
    if (submitting) return;

    const invalidLabels = invalidMeasurementLabels();
    if (invalidLabels.length > 0) {
      Alert.alert(
        'Invalid measurements',
        `Check these fields: ${invalidLabels.join(', ')}. Use positive numbers for dimensions and whole numbers from 0 to 20 for counts.`
      );
      return;
    }

    setSubmitting(true);
    if (hasAnyValue) {
      setMeasurements({
        lengthFt: roomLength,
        widthFt: roomWidth,
        ceilingHeightFt: ceilingHeight,
        numWindows,
        numDoors,
        hasIsland: isBathroom ? false : hasIsland,
        upperCabHeight: isBathroom ? '' : upperCabHeight,
        lowerCabHeight: isBathroom ? '' : lowerCabHeight,
        cabDepth: isBathroom ? '' : cabDepth,
        upperLinearFt: isBathroom ? '' : upperLinearFt,
        lowerLinearFt: isBathroom ? '' : lowerLinearFt,
        countertopLinearFt: isBathroom ? '' : countertopLinearFt,
        doorWidth,
        doorHeight,
        windowWidth,
        windowHeight,
        fridgeWidth: isBathroom ? '' : fridgeWidth,
        rangeWidth: isBathroom ? '' : rangeWidth,
        hasDishwasher: isBathroom ? false : hasDishwasher,
        islandLength: isBathroom ? '' : islandLength,
        islandWidth: isBathroom ? '' : islandWidth,
        // Bathroom fields
        hasShowerTub: isBathroom ? hasShowerTub : false,
        showerLength: isBathroom ? showerLength : '',
        showerWidth: isBathroom ? showerWidth : '',
        vanityWidth: isBathroom ? vanityWidth : '',
        numSinks: isBathroom ? numSinks : '',
        floorTileArea: isBathroom ? floorTileArea : '',
        wallTileArea: isBathroom ? wallTileArea : '',
      });
    } else {
      setMeasurements(null);
    }
    setRoomScanData(null);
    useProjectWizardStore.getState().setStep(3);
    navigation.navigate('Analyzing', { measurementsSkipped: false });
  };

  const handleSkip = () => {
    if (submitting) return;

    setSubmitting(true);
    setMeasurements(null);
    setRoomScanData(null);
    useProjectWizardStore.getState().setStep(3);
    navigation.navigate('Analyzing', { measurementsSkipped: true });
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={16}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <WizardHeader currentStep={3} />

            <Text style={styles.stepLabel}>STEP 3 OF 8</Text>
            <Text style={styles.title}>Room measurements</Text>
            <Text style={styles.subtitle}>
              Start with the room size. Contractor-level details are optional and can be added if you know them.
            </Text>

            {/* ── LiDAR Scan CTA ── */}
            <TouchableOpacity
              style={styles.lidarCard}
              onPress={() => navigation.navigate('RoomScan', { fromWizard: true })}
              activeOpacity={0.85}
            >
              <View style={styles.lidarIconWrap}>
                <Ionicons name="scan-outline" size={28} color="#06B6D4" />
              </View>
              <View style={styles.lidarText}>
                <Text style={styles.lidarTitle}>Scan with Camera</Text>
                <Text style={styles.lidarSub}>Auto-measure walls, doors & windows (LiDAR devices)</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.text.tertiary} />
            </TouchableOpacity>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orLabel}>or enter manually</Text>
              <View style={styles.orLine} />
            </View>

            {/* ── Room ── */}
            <SectionHeader icon="resize-outline" title="Room" />
            <Card>
              <Field label="Length" hint="Longest wall" value={roomLength} onChangeText={setRoomLength} />
              <Divider />
              <Field label="Width" hint="Shortest wall" value={roomWidth} onChangeText={setRoomWidth} />
              <Divider />
              <Field label="Ceiling height" value={ceilingHeight} onChangeText={setCeilingHeight} />
            </Card>

            {/* ── Doors & Windows ── */}
            <SectionHeader icon="albums-outline" title="Openings" />
            <Card>
              <Field label="Number of doors" hint={isBathroom ? 'Entry or shower door' : 'Entry or pantry doors'} value={numDoors} onChangeText={setNumDoors} unit="" keyboardType="number-pad" />
              <Divider />
              <Field label="Number of windows" value={numWindows} onChangeText={setNumWindows} unit="" keyboardType="number-pad" />
            </Card>

            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced((v) => !v)}
              activeOpacity={0.82}
            >
              <View style={styles.advancedIconWrap}>
                <Ionicons name="options-outline" size={20} color="#FF6B00" />
              </View>
              <View style={styles.advancedTextWrap}>
                <Text style={styles.advancedTitle}>Advanced measurements</Text>
                <Text style={styles.advancedSubtitle}>
                  {isBathroom
                    ? 'Vanity, shower/tub, tile, and exact opening sizes.'
                    : 'Cabinets, countertops, appliances, island, and exact opening sizes.'}
                </Text>
              </View>
              <Ionicons
                name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={Colors.text.tertiary}
              />
            </TouchableOpacity>

            {showAdvanced && (
              isBathroom ? (
                <>
                {/* ── Shower / Tub ── */}
                <SectionHeader icon="water-outline" title="Shower / Tub" />
                <Card>
                  <ToggleRow label="Has shower or tub" hint="Walk-in, alcove, or freestanding" value={hasShowerTub} onValueChange={setHasShowerTub} />
                  {hasShowerTub && (
                    <>
                      <Divider />
                      <Field label="Shower/tub length" value={showerLength} onChangeText={setShowerLength} />
                      <Divider />
                      <Field label="Shower/tub width" value={showerWidth} onChangeText={setShowerWidth} />
                    </>
                  )}
                </Card>

                {/* ── Vanity ── */}
                <SectionHeader icon="construct-outline" title="Vanity" />
                <Card>
                  <Field label="Vanity width" hint="Cabinet width" value={vanityWidth} onChangeText={setVanityWidth} />
                  <Divider />
                  <Field label="Number of sinks" hint="Single or double" value={numSinks} onChangeText={setNumSinks} unit="" keyboardType="number-pad" />
                </Card>

                {/* ── Tile ── */}
                <SectionHeader icon="grid-outline" title="Tile" />
                <Card>
                  <Field label="Floor tile area" value={floorTileArea} onChangeText={setFloorTileArea} unit="sqft" />
                  <Divider />
                  <Field label="Wall tile area" hint="Shower/tub surround" value={wallTileArea} onChangeText={setWallTileArea} unit="sqft" />
                </Card>
                </>
              ) : (
                <>
                {/* ── Cabinets ── */}
                <SectionHeader icon="grid-outline" title="Cabinets" />
                <Card>
                  <Field label="Upper cabinet height" hint="Height of each door" value={upperCabHeight} onChangeText={setUpperCabHeight} />
                  <Divider />
                  <Field label="Lower cabinet height" hint="Base cabinet height" value={lowerCabHeight} onChangeText={setLowerCabHeight} />
                  <Divider />
                  <Field label="Cabinet depth" hint="How far they stick out" value={cabDepth} onChangeText={setCabDepth} />
                  <Divider />
                  <Field label="Upper cabinet run" hint="Total linear footage" value={upperLinearFt} onChangeText={setUpperLinearFt} />
                  <Divider />
                  <Field label="Lower cabinet run" hint="Total linear footage" value={lowerLinearFt} onChangeText={setLowerLinearFt} />
                </Card>

                {/* ── Countertops ── */}
                <SectionHeader icon="layers-outline" title="Countertops" />
                <Card>
                  <Field label="Total countertop length" hint="All sections combined" value={countertopLinearFt} onChangeText={setCountertopLinearFt} />
                </Card>

                {/* ── Appliances ── */}
                <SectionHeader icon="hardware-chip-outline" title="Appliances" />
                <Card>
                  <Field label="Fridge opening width" hint="Width of the cutout" value={fridgeWidth} onChangeText={setFridgeWidth} />
                  <Divider />
                  <Field label="Range / cooktop width" hint="Stove cutout width" value={rangeWidth} onChangeText={setRangeWidth} />
                  <Divider />
                  <ToggleRow label="Dishwasher" hint='Standard 24" slot' value={hasDishwasher} onValueChange={setHasDishwasher} />
                </Card>

                {/* ── Island ── */}
                <SectionHeader icon="square-outline" title="Island" />
                <Card>
                  <ToggleRow label="Has kitchen island" value={hasIsland} onValueChange={setHasIsland} />
                  {hasIsland && (
                    <>
                      <Divider />
                      <Field label="Island length" value={islandLength} onChangeText={setIslandLength} />
                      <Divider />
                      <Field label="Island width" value={islandWidth} onChangeText={setIslandWidth} />
                    </>
                  )}
                </Card>
                </>
              )
            )}

            {showAdvanced && (
              <>
                <SectionHeader icon="resize-outline" title="Exact opening sizes" />
                <Card>
                  <Field label="Door width" value={doorWidth} onChangeText={setDoorWidth} />
                  <Divider />
                  <Field label="Door height" value={doorHeight} onChangeText={setDoorHeight} />
                  <Divider />
                  <Field label="Window width" hint="Typical window" value={windowWidth} onChangeText={setWindowWidth} />
                  <Divider />
                  <Field label="Window height" hint="Typical window" value={windowHeight} onChangeText={setWindowHeight} />
                </Card>
              </>
            )}

            {/* Tip */}
            <View style={styles.tip}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.text.tertiary} style={styles.tipIcon} />
              <Text style={styles.tipText}>
                Leave anything blank if you are unsure. Photos and the pricing engine will use standard defaults.
              </Text>
            </View>

            <GlassButton
              label="Continue"
              onPress={handleContinue}
              loading={submitting}
              fullWidth
              size="lg"
              style={styles.cta}
            />

            <TouchableOpacity
              onPress={handleSkip}
              style={[styles.skipBtn, submitting && styles.skipBtnDisabled]}
              activeOpacity={0.7}
              disabled={submitting}
            >
              <Text style={styles.skipText}>Skip measurements</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  stepLabel: { ...Typography.label, color: Colors.accent, marginBottom: 8 },
  title: { ...Typography.h1, marginBottom: 8 },
  subtitle: { ...Typography.bodySecondary, marginBottom: Spacing.lg, lineHeight: 22 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: Spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: Colors.glass.surface,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: Colors.glass.border },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  fieldLabelWrap: { flex: 1 },
  fieldLabel: { fontSize: 14, fontWeight: '500', color: Colors.text.primary },
  fieldHint: { fontSize: 11, color: Colors.text.tertiary, marginTop: 2 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.item,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    paddingHorizontal: 10,
    height: 38,
    minWidth: 72,
  },
  input: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    minWidth: 36,
    textAlign: 'right',
  },
  unit: { fontSize: 12, color: Colors.text.tertiary, marginLeft: 4 },

  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    paddingHorizontal: 4,
  },
  tipIcon: {
    marginTop: 1,
  },
  tipText: { ...Typography.caption, flex: 1, lineHeight: 18 },

  cta: { marginBottom: 12 },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipBtnDisabled: { opacity: 0.5 },
  skipText: { fontSize: 14, color: Colors.text.tertiary, fontWeight: '500' },

  lidarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    marginBottom: Spacing.md,
  },
  lidarIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  lidarText: { flex: 1 },
  lidarTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 3 },
  lidarSub: { fontSize: 12, color: Colors.text.secondary, lineHeight: 16 },

  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: Spacing.md,
    padding: 14,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.surface.borderStrong,
    backgroundColor: Colors.surface.default,
  },
  advancedIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.12)',
  },
  advancedTextWrap: { flex: 1 },
  advancedTitle: { fontSize: 15, fontWeight: '700', color: Colors.text.primary, marginBottom: 2 },
  advancedSubtitle: { fontSize: 12, color: Colors.text.secondary, lineHeight: 16 },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.glass.border },
  orLabel: { fontSize: 12, color: Colors.text.tertiary, fontWeight: '500' },
});
