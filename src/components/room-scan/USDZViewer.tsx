import React from 'react';
import { Platform, requireNativeComponent, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

interface NativeUSDZViewerProps {
  filePath?: string;
  measurementData?: string;
  style?: StyleProp<ViewStyle>;
}

const NativeUSDZViewerView = Platform.OS === 'ios'
  ? requireNativeComponent<NativeUSDZViewerProps>('USDZViewerView')
  : null;

interface USDZViewerProps {
  filePath: string | null;
  scanData?: any;
  style?: StyleProp<ViewStyle>;
}

export function USDZViewer({ filePath, scanData, style }: USDZViewerProps) {
  // Always pass measurement data as JSON so the 3D view can render
  // a generated model with labels even when no USDZ file exists
  const measurementJSON = scanData ? JSON.stringify(scanData) : undefined;

  if (Platform.OS !== 'ios' || (!filePath && !scanData)) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>3D model not available</Text>
        <Text style={styles.placeholderSubtext}>
          {Platform.OS === 'ios'
            ? 'Scan a room on a LiDAR-equipped device to generate a 3D model'
            : '3D room models are currently available on iOS devices with room scanning'}
        </Text>
      </View>
    );
  }

  return (
    NativeUSDZViewerView
      ? (
        <NativeUSDZViewerView
          filePath={filePath ?? ''}
          measurementData={measurementJSON}
          style={[styles.viewer, style]}
        />
      )
      : null
  );
}

const styles = StyleSheet.create({
  viewer: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.bg.primary,
    borderRadius: 12,
    overflow: 'hidden',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.bg.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surface.border,
  },
  placeholderText: {
    ...Typography.h3,
    color: Colors.text.tertiary,
  },
  placeholderSubtext: {
    ...Typography.caption,
    color: Colors.text.tertiary,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
});
