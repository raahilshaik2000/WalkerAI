import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GlassButton, GlassInput, GradientBackground } from '@/components/ui';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function ManualMeasurementScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const fromWizard = route.params?.fromWizard ?? false;
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('2.7');
  const [doorCount, setDoorCount] = useState('1');
  const [windowCount, setWindowCount] = useState('1');

  function handleGenerate() {
    const l = parseDimension(length);
    const w = parseDimension(width);
    const h = parseDimension(height) || 2.7;
    const doors = parseInt(doorCount) || 0;
    const windows = parseInt(windowCount) || 0;

    if (!l || !w || l <= 0 || w <= 0) {
      Alert.alert('Invalid Dimensions', 'Please enter valid room length and width.');
      return;
    }

    // Generate a rectangular room layout from manual input
    const halfL = l / 2;
    const halfW = w / 2;

    const walls = [
      { id: 'wall_1', width: l, height: h, angle: 0, center: { x: 0, y: h / 2, z: -halfW } },
      { id: 'wall_2', width: w, height: h, angle: Math.PI / 2, center: { x: halfL, y: h / 2, z: 0 } },
      { id: 'wall_3', width: l, height: h, angle: 0, center: { x: 0, y: h / 2, z: halfW } },
      { id: 'wall_4', width: w, height: h, angle: Math.PI / 2, center: { x: -halfL, y: h / 2, z: 0 } },
    ];

    // Place doors evenly along wall 1
    const doorData = Array.from({ length: doors }, (_, i) => ({
      id: `door_${i}`,
      width: 0.9,
      height: 2.1,
      angle: 0,
      center: {
        x: -halfL + ((i + 1) * l) / (doors + 1),
        y: 1.05,
        z: -halfW,
      },
    }));

    // Place windows evenly along wall 2
    const windowData = Array.from({ length: windows }, (_, i) => ({
      id: `window_${i}`,
      width: 1.2,
      height: 1.0,
      angle: Math.PI / 2,
      center: {
        x: halfL,
        y: 1.8,
        z: -halfW + ((i + 1) * w) / (windows + 1),
      },
    }));

    const scanData = {
      walls,
      doors: doorData,
      windows: windowData,
      objects: [],
      roomDimensions: {
        length: l,
        width: w,
        height: h,
        area: l * w,
      },
      usdzFilePath: null,
      isMock: false,
    };

    navigation.replace('RoomResults', { scanData, fromWizard });
  }

  return (
    <GradientBackground>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <GlassButton
            label=""
            variant="ghost"
            size="sm"
            onPress={() => navigation.goBack()}
            icon={<Ionicons name="arrow-back" size={22} color="#FFFFFF" />}
          />
          <Text style={styles.headerTitle}>Manual Measurement</Text>
          <View style={{ width: 40 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.iconWrapper}>
              <Ionicons name="create-outline" size={48} color="#06B6D4" />
            </View>

            <Text style={styles.title}>Enter Room Dimensions</Text>
            <Text style={styles.subtitle}>
              Measure your room and enter the dimensions below. Use meters for accuracy.
            </Text>

            <View style={styles.form}>
              <Text style={styles.sectionLabel}>Room Size</Text>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <GlassInput
                    label="Length (m)"
                    value={length}
                    onChangeText={setLength}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.halfInput}>
                  <GlassInput
                    label="Width (m)"
                    value={width}
                    onChangeText={setWidth}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <GlassInput
                label="Ceiling Height (m)"
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                hint="Default: 2.7m (standard ceiling)"
              />

              <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>
                Openings (Optional)
              </Text>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <GlassInput
                    label="Number of Doors"
                    value={doorCount}
                    onChangeText={setDoorCount}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.halfInput}>
                  <GlassInput
                    label="Number of Windows"
                    value={windowCount}
                    onChangeText={setWindowCount}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Bottom CTA */}
        <View style={styles.bottom}>
          <GlassButton
            label="Generate Layout"
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleGenerate}
            icon={<Ionicons name="sparkles" size={20} color="#000" />}
          />
        </View>
      </SafeAreaView>
    </GradientBackground>
  );
}

function parseDimension(value: string) {
  const normalized = value
    .replace(/[٫٬,·•]/g, '.')
    .replace(/[^\d.-]/g, '');

  return parseFloat(normalized);
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
  },
  headerTitle: Typography.h3,
  scrollContent: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: 120,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  title: { ...Typography.h2, textAlign: 'center', marginBottom: Spacing.xs },
  subtitle: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  form: {},
  sectionLabel: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Spacing.sm,
  },
  halfInput: { flex: 1 },
  bottom: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
});
