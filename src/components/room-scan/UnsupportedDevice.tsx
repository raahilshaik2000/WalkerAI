import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { GlassButton } from '@/components/ui';
import { Colors, Typography, Spacing } from '@/constants/theme';

interface UnsupportedDeviceProps {
  onManualMeasurement: () => void;
  onGoBack: () => void;
}

export function UnsupportedDevice({ onManualMeasurement, onGoBack }: UnsupportedDeviceProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrapper}>
        <Ionicons name="warning-outline" size={64} color="#FF6B00" />
      </View>
      <Text style={styles.title}>LiDAR Required</Text>
      <Text style={styles.body}>
        Automatic room scanning requires an iPhone 12 Pro or newer with a LiDAR sensor.
      </Text>
      <Text style={styles.body}>
        You can still enter your room measurements manually.
      </Text>
      <View style={styles.buttons}>
        <GlassButton
          label="Enter Measurements Manually"
          variant="primary"
          fullWidth
          onPress={onManualMeasurement}
          icon={<Ionicons name="create-outline" size={18} color="#000" />}
        />
        <View style={styles.spacer} />
        <GlassButton
          label="Go Back"
          variant="secondary"
          fullWidth
          onPress={onGoBack}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 107, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.h1,
    marginBottom: Spacing.sm,
  },
  body: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  buttons: {
    width: '100%',
    marginTop: Spacing.lg,
  },
  spacer: { height: 12 },
});
