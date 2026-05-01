import { useState } from 'react';
import {
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
  placeholder = '—',
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
  const { setMeasurements } = useProjectWizardStore();

  // Room
  const [roomLength, setRoomLength] = useState('');
  const [roomWidth, setRoomWidth] = useState('');
  const [ceilingHeight, setCeilingHeight] = useState('');

  // Cabinets
  const [upperCabHeight, setUpperCabHeight] = useState('');
  const [lowerCabHeight, setLowerCabHeight] = useState('');
  const [cabDepth, setCabDepth] = useState('');
  const [upperLinearFt, setUpperLinearFt] = useState('');
  const [lowerLinearFt, setLowerLinearFt] = useState('');

  // Countertops
  const [countertopLinearFt, setCountertopLinearFt] = useState('');

  // Doors & Windows
  const [numDoors, setNumDoors] = useState('');
  const [doorWidth, setDoorWidth] = useState('');
  const [doorHeight, setDoorHeight] = useState('');
  const [numWindows, setNumWindows] = useState('');
  const [windowWidth, setWindowWidth] = useState('');
  const [windowHeight, setWindowHeight] = useState('');

  // Appliances
  const [fridgeWidth, setFridgeWidth] = useState('');
  const [rangeWidth, setRangeWidth] = useState('');
  const [hasDishwasher, setHasDishwasher] = useState(false);

  // Island
  const [hasIsland, setHasIsland] = useState(false);
  const [islandLength, setIslandLength] = useState('');
  const [islandWidth, setIslandWidth] = useState('');

  const hasAnyValue = [
    roomLength, roomWidth, ceilingHeight,
    upperCabHeight, lowerCabHeight, cabDepth, upperLinearFt, lowerLinearFt,
    countertopLinearFt,
    numDoors, doorWidth, doorHeight, numWindows, windowWidth, windowHeight,
    fridgeWidth, rangeWidth,
    islandLength, islandWidth,
  ].some(Boolean) || hasDishwasher || hasIsland;

  const handleContinue = () => {
    if (hasAnyValue) {
      setMeasurements({
        lengthFt: roomLength,
        widthFt: roomWidth,
        ceilingHeightFt: ceilingHeight,
        numWindows,
        numDoors,
        hasIsland,
        // Extended fields stored in the same object via type extension
        upperCabHeight,
        lowerCabHeight,
        cabDepth,
        upperLinearFt,
        lowerLinearFt,
        countertopLinearFt,
        doorWidth,
        doorHeight,
        windowWidth,
        windowHeight,
        fridgeWidth,
        rangeWidth,
        hasDishwasher,
        islandLength,
        islandWidth,
      });
    }
    useProjectWizardStore.getState().setStep(3);
    navigation.navigate('Analyzing');
  };

  const handleSkip = () => {
    setMeasurements(null);
    useProjectWizardStore.getState().setStep(3);
    navigation.navigate('Analyzing');
  };

  return (
    <GradientBackground glow="top-right">
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={16}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <WizardHeader currentStep={2} />

            <Text style={styles.stepLabel}>STEP 3 OF 8</Text>
            <Text style={styles.title}>Room measurements</Text>
            <Text style={styles.subtitle}>
              The more detail you provide, the more accurate your cost estimate will be. All fields are optional.
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

            {/* ── Doors & Windows ── */}
            <SectionHeader icon="albums-outline" title="Doors & Windows" />
            <Card>
              <Field label="Number of doors" hint="Incl. pantry & entry" value={numDoors} onChangeText={setNumDoors} unit="" keyboardType="number-pad" />
              <Divider />
              <Field label="Door width" value={doorWidth} onChangeText={setDoorWidth} />
              <Divider />
              <Field label="Door height" value={doorHeight} onChangeText={setDoorHeight} />
              <Divider />
              <Field label="Number of windows" value={numWindows} onChangeText={setNumWindows} unit="" keyboardType="number-pad" />
              <Divider />
              <Field label="Window width" hint="Typical window" value={windowWidth} onChangeText={setWindowWidth} />
              <Divider />
              <Field label="Window height" hint="Typical window" value={windowHeight} onChangeText={setWindowHeight} />
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

            {/* Tip */}
            <View style={styles.tip}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.text.tertiary} />
              <Text style={styles.tipText}>
                Not sure about some fields? Leave them blank — our AI estimates what it can from your photos.
              </Text>
            </View>

            <GlassButton
              label="Continue"
              onPress={handleContinue}
              fullWidth
              size="lg"
              style={styles.cta}
            />

            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn} activeOpacity={0.7}>
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
  tipText: { ...Typography.caption, flex: 1, lineHeight: 18 },

  cta: { marginBottom: 12 },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
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

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.md,
  },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.glass.border },
  orLabel: { fontSize: 12, color: Colors.text.tertiary, fontWeight: '500' },
});
