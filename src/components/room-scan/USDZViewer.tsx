import React from 'react';
import { requireNativeComponent, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

interface NativeUSDZViewerProps {
  filePath: string;
  style?: StyleProp<ViewStyle>;
}

const NativeUSDZViewerView = requireNativeComponent<NativeUSDZViewerProps>('USDZViewerView');

interface USDZViewerProps {
  filePath: string | null;
  style?: StyleProp<ViewStyle>;
}

export function USDZViewer({ filePath, style }: USDZViewerProps) {
  if (!filePath) {
    return (
      <View style={[styles.placeholder, style]}>
        <Text style={styles.placeholderText}>3D model not available</Text>
        <Text style={styles.placeholderSubtext}>
          Scan a room on a LiDAR-equipped device to generate a 3D model
        </Text>
      </View>
    );
  }

  return <NativeUSDZViewerView filePath={filePath} style={[styles.viewer, style]} />;
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
